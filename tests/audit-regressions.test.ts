// Regression suite: the former audit reproductions must now be rejected or handled safely.
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
const actor = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({
  getSession: async () => (actor.id ? { sub: actor.id } : null),
  getCurrentUser: async () =>
    actor.id ? (await import("@/lib/db")).db.user.findUnique({ where: { id: actor.id } }) : null,
}));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/limits", () => ({
  getPlanLimits: async () => ({ maxListings: 2, maxAuctions: 2, maxStores: 1, dailyPoints: 5 }),
}));
import { db } from "@/lib/db";
import { featureListing, relistListing, expireFeaturedListings } from "@/lib/listing-policy";
import { applyCredibility, evaluateTransaction } from "@/lib/credibility";
import { getSettingInt } from "@/lib/settings";
import { isAllowedPushEndpoint, isPublicPushAddress } from "@/lib/push-policy";
import { POST as markRead } from "@/app/api/conversations/[id]/read/route";
import { GET as mobileListings } from "@/app/api/mobile/listings/route";
import { POST as createListing } from "@/app/api/listings/route";

import { POST as ownerAction } from "@/app/api/mobile/me/listings/[id]/action/route";
import { GET as messages } from "@/app/api/conversations/[id]/messages/route";
import { GET as storeDetail } from "@/app/api/mobile/stores/[slug]/route";
import { POST as reset } from "@/app/api/auth/reset/route";
import { POST as bid } from "@/app/api/auctions/[id]/bids/route";
const prefix = `audit-${Date.now()}`;
let seller = "",
  buyer = "",
  category = "";
const listingIds: string[] = [];
const req = (body: object) =>
  new Request("http://localhost/audit", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.222" },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function listing(status = "ACTIVE", auction = false) {
  const row = await db.listing.create({
    data: {
      title: "Audit fixture",
      description: "Temporary local fixture",
      city: "الرياض",
      sellerId: seller,
      categoryId: category,
      status,
      type: auction ? "AUCTION" : "STANDARD",
      ...(auction
        ? { auction: { create: { startPrice: 100, endsAt: new Date(Date.now() + 3600000) } } }
        : {}),
    },
    include: { auction: true },
  });
  listingIds.push(row.id);
  return row;
}
beforeAll(async () => {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname))
    throw new Error("Local database required");
  category = (
    await db.category.create({
      data: { slug: prefix, nameAr: "اختبار مؤقت", nameEn: "Audit", icon: "Box" },
    })
  ).id;
  for (const name of ["seller", "buyer"]) {
    const user = await db.user.create({
      data: {
        name: `${prefix}-${name}`,
        email: `${prefix}-${name}@example.invalid`,
        passwordHash: "fixture",
        city: "الرياض",
        emailVerifiedAt: new Date(),
      },
    });
    if (name === "seller") seller = user.id;
    else buyer = user.id;
  }
});
afterAll(async () => {
  await db.transaction.deleteMany({ where: { sellerId: seller } });
  await db.listing.deleteMany({ where: { id: { in: listingIds } } });
  await db.store.deleteMany({ where: { userId: seller } });
  await db.user.deleteMany({ where: { id: { in: [seller, buyer].filter(Boolean) } } });
  if (category) await db.category.delete({ where: { id: category } });
  await db.$disconnect();
});
it("SEC-01: removed listings cannot bypass moderation", async () => {
  actor.id = seller;
  const row = await listing("REMOVED");
  expect((await ownerAction(req({ action: "sold" }), ctx(row.id))).status).toBe(409);
  expect((await ownerAction(req({ action: "relist" }), ctx(row.id))).status).toBe(409);
  expect((await db.listing.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("REMOVED");
});
it("SEC-02: removed auctions reject bids", async () => {
  actor.id = buyer;
  const row = await listing("REMOVED", true);
  expect((await bid(req({ amount: 100 }), ctx(row.auction!.id))).status).toBe(409);
  expect(await db.bid.count({ where: { auctionId: row.auction!.id } })).toBe(0);
});
it("SEC-03: seller cannot erase bids by deleting an auction", async () => {
  actor.id = seller;
  const row = await listing("ACTIVE", true);
  await db.bid.create({
    data: { auctionId: row.auction!.id, bidderId: buyer, amount: 100, maskedName: "audit" },
  });
  expect((await ownerAction(req({ action: "delete" }), ctx(row.id))).status).toBe(409);
  expect(await db.bid.count({ where: { auctionId: row.auction!.id } })).toBe(1);
});
it("FUN-01: latest messages, full pagination and explicit read receipts", async () => {
  const row = await listing();
  actor.id = seller;
  const conv = await db.conversation.create({
    data: { listingId: row.id, buyerId: buyer, sellerId: seller },
  });
  await db.message.createMany({
    data: Array.from({ length: 201 }, (_, i) => ({
      id: `${prefix}-m-${i}`,
      conversationId: conv.id,
      senderId: buyer,
      body: `message ${i}`,
      createdAt: new Date(Date.now() + i * 1000),
    })),
  });
  const response = await messages(new Request("http://localhost/audit"), ctx(conv.id));
  const data = await response.json();
  expect(data.messages).toHaveLength(50);
  expect(data.messages.some((m: { id: string }) => m.id === `${prefix}-m-200`)).toBe(true);
  expect(
    (await db.message.findUniqueOrThrow({ where: { id: `${prefix}-m-200` } })).readAt,
  ).toBeNull();
  await markRead(req({ ids: [`${prefix}-m-200`] }), ctx(conv.id));
  expect(
    (await db.message.findUniqueOrThrow({ where: { id: `${prefix}-m-200` } })).readAt,
  ).not.toBeNull();
  expect(
    (await db.message.findUniqueOrThrow({ where: { id: `${prefix}-m-0` } })).readAt,
  ).toBeNull();
  const seen = new Set<string>(data.messages.map((m: { id: string }) => m.id));
  let page = data;
  while (page.hasMoreBefore) {
    page = await (
      await messages(
        new Request(`http://localhost/audit?before=${page.messages[0].id}`),
        ctx(conv.id),
      )
    ).json();
    page.messages.forEach((m: { id: string }) => seen.add(m.id));
  }
  expect(seen.size).toBe(201);
});
it("SEC-08: banned stores are hidden", async () => {
  await db.user.update({ where: { id: seller }, data: { isBanned: true } });
  await db.store.create({
    data: {
      userId: seller,
      slug: prefix,
      name: "audit store",
      whatsapp: "AUDIT-NOT-A-NUMBER",
      isVerified: true,
    },
  });
  actor.id = "";
  const response = await storeDetail(new Request("http://localhost/audit"), {
    params: Promise.resolve({ slug: prefix }),
  });
  expect(response.status).toBe(404);
  await db.user.update({ where: { id: seller }, data: { isBanned: false } });
});
it("FUN-04: password reset clears lock and is single-use", async () => {
  const token = randomBytes(32).toString("hex");
  const lockUntil = new Date(Date.now() + 3600000);
  await db.user.update({ where: { id: buyer }, data: { lockUntil, failedLogins: 10 } });
  await db.passwordResetToken.create({
    data: {
      userId: buyer,
      token: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  expect((await reset(req({ token, password: "AuditTemporary123!" }))).status).toBe(200);
  expect((await db.user.findUniqueOrThrow({ where: { id: buyer } })).lockUntil).toBeNull();
  expect((await reset(req({ token, password: "AuditTemporary123!" }))).status).toBe(400);
});
it("SEC-04: push rejects arbitrary endpoints and internal resolved addresses", () => {
  for (const endpoint of [
    "https://127.0.0.1/push",
    "https://evil.example",
    "http://fcm.googleapis.com/push",
    "https://fcm.googleapis.com.evil.example/push",
    "https://fcm.googleapis.com:9443/push",
  ])
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/example")).toBe(true);
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "169.254.169.254",
    "fc00::1",
  ])
    expect(isPublicPushAddress(ip)).toBe(false);
});
it("DATA-01: concurrent feature requests charge once", async () => {
  const row = await listing();
  const cost = await getSettingInt("FEATURE_POINT_COST", 100);
  await db.user.update({ where: { id: seller }, data: { points: cost * 10 } });
  const results = await Promise.all(
    Array.from({ length: 8 }, () => featureListing(row.id, seller)),
  );
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((await db.user.findUniqueOrThrow({ where: { id: seller } })).points).toBe(cost * 9);
});
it("DATA-02: simultaneous credibility adjustments and transaction completion are exact", async () => {
  await db.user.updateMany({
    where: { id: { in: [seller, buyer] } },
    data: { credibility: 50, successfulTx: 0 },
  });
  await Promise.all(
    Array.from({ length: 8 }, () => applyCredibility(seller, 1, "audit concurrent")),
  );
  expect((await db.user.findUniqueOrThrow({ where: { id: seller } })).credibility).toBe(58);
  const row = await listing();
  const tx = await db.transaction.create({
    data: {
      listingId: row.id,
      sellerId: seller,
      buyerId: buyer,
      amount: 100,
      source: "STANDARD",
      sellerAnswer: "YES",
      buyerAnswer: "YES",
      deadline: new Date(Date.now() + 3600000),
    },
  });
  await Promise.all(Array.from({ length: 8 }, () => evaluateTransaction(tx.id)));
  const user = await db.user.findUniqueOrThrow({ where: { id: seller } });
  expect(user.successfulTx).toBe(1);
  expect(user.credibility).toBe(63);
});
it("FUN-02: expired feature flags are cleared", async () => {
  const row = await listing();
  await db.listing.update({
    where: { id: row.id },
    data: { isFeatured: true, featuredUntil: new Date(Date.now() - 1000) },
  });
  await expireFeaturedListings();
  expect((await db.listing.findUniqueOrThrow({ where: { id: row.id } })).isFeatured).toBe(false);
});
it("FUN-05: mixed listing quotas hold under concurrent relists", async () => {
  await db.listing.updateMany({ where: { sellerId: seller }, data: { status: "EXPIRED" } });
  await listing();
  const a = await listing("EXPIRED"),
    b = await listing("EXPIRED");
  await db.listing.update({ where: { id: b.id }, data: { type: "ANNOUNCE" } });
  const results = await Promise.all([
    relistListing(a.id, { id: seller, isPro: false }),
    relistListing(b.id, { id: seller, isPro: false }),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(
    await db.listing.count({
      where: { sellerId: seller, status: "ACTIVE", type: { not: "AUCTION" } },
    }),
  ).toBe(2);
});
it("FUN-07: invalid page input returns 400", async () => {
  for (const page of ["Infinity", "1.03", "-1", "999999999"])
    expect(
      (await mobileListings(new Request(`http://localhost/api/mobile/listings?page=${page}`)))
        .status,
    ).toBe(400);
});
it("FUN-03: invalid auction amounts cannot leave orphan listings", async () => {
  actor.id = seller;
  const before = await db.listing.count({ where: { sellerId: seller } });
  const data = new FormData();
  Object.entries({
    type: "AUCTION",
    goal: "AUCTION",
    categoryId: category,
    title: "Audit auction invalid",
    description: "This is a temporary audit description long enough.",
    city: "الرياض",
    startPrice: "2147483648",
    minIncrement: "50",
    durationHours: "24",
  }).forEach(([k, v]) => data.set(k, v));
  const response = await createListing(
    new Request("http://localhost/api/listings", { method: "POST", body: data }),
  );
  expect(response.status).toBe(400);
  expect(await db.listing.count({ where: { sellerId: seller } })).toBe(before);
});
