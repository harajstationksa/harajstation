// Regression suite for the 2026-10-09 audit fixes (auctions, TOTP, listing
// freeze, direct chats, refunds). Runs against the local development database.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const actor = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({
  getSession: async () => (actor.id ? { sub: actor.id, name: "fixture" } : null),
  getCurrentUser: async () =>
    actor.id ? (await import("@/lib/db")).db.user.findUnique({ where: { id: actor.id } }) : null,
}));
import { db } from "@/lib/db";
import { POST as bid } from "@/app/api/auctions/[id]/bids/route";
import { POST as proxy } from "@/app/api/auctions/[id]/proxy/route";
import { POST as block } from "@/app/api/auctions/[id]/block/route";
import { PATCH as editListing } from "@/app/api/listings/[id]/route";
import { POST as createConversation } from "@/app/api/conversations/route";
import { finalizeExpiredAuctions } from "@/lib/auction";
import { BID_POLICY, maxBidFor } from "@/lib/bid-policy";
import { base32Encode, currentTotpStep, totpCode, verifyTotp } from "@/lib/totp";
import { reversePaymentIfRefunded } from "@/lib/payments";
import { POST as addEvidence } from "@/app/api/transactions/[id]/evidence/route";
import { GET as evidenceImage } from "@/app/api/transactions/[id]/evidence/[evidenceId]/image/route";
import sharp from "sharp";
import { deletePrivateImage } from "@/lib/uploads";

const prefix = `rel1009-${Date.now()}`;
const users: Record<string, string> = {};
const listingIds: string[] = [];
let category = "";
let ip = 1;
const json = (body: object) =>
  new Request("http://localhost/release", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `10.91.0.${ip++ % 250}` },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function auction(opts: { startPrice?: number; endsInMs?: number; buyNow?: number } = {}) {
  const row = await db.listing.create({
    data: {
      title: "Release fixture auction",
      description: "Temporary local fixture for regression tests",
      city: "الرياض",
      sellerId: users.seller,
      categoryId: category,
      type: "AUCTION",
      auction: {
        create: {
          startPrice: opts.startPrice ?? 100,
          minIncrement: 10,
          buyNowPrice: opts.buyNow ?? null,
          endsAt: new Date(Date.now() + (opts.endsInMs ?? 3_600_000)),
        },
      },
    },
    include: { auction: true },
  });
  listingIds.push(row.id);
  return row.auction!;
}

beforeAll(async () => {
  category = (
    await db.category.create({
      data: { slug: prefix, nameAr: "اختبار", nameEn: "Release", icon: "Box" },
    })
  ).id;
  const old = new Date(Date.now() - 10 * 86_400_000);
  for (const [name, createdAt] of [
    ["seller", old],
    ["fresh", new Date()],
    ["vet", old],
    ["rival", old],
    ["stranger", old],
  ] as const) {
    const user = await db.user.create({
      data: {
        name: `${prefix}-${name}`,
        email: `${prefix}-${name}@example.invalid`,
        passwordHash: "fixture",
        city: "الرياض",
        emailVerifiedAt: new Date(),
        createdAt,
      },
    });
    users[name] = user.id;
  }
});

afterAll(async () => {
  const ids = Object.values(users);
  await db.transaction.deleteMany({ where: { listingId: { in: listingIds } } });
  await db.listing.deleteMany({ where: { id: { in: listingIds } } });
  await db.voidedBid.deleteMany({ where: { bidderId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.conversation.deleteMany({
    where: { OR: [{ buyerId: { in: ids } }, { sellerId: { in: ids } }] },
  });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.category.delete({ where: { id: category } });
  await db.$disconnect();
});

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 vector and refuses replays", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpCode(secret, 1)).toBe("287082"); // RFC 6238: 94287082 at T=59s
    expect(verifyTotp(secret, "287082", null, 59_000)).toBe(1);
    expect(verifyTotp(secret, "287082", 1, 59_000)).toBeNull();
    expect(verifyTotp(secret, "000000", null, 59_000)).toBeNull();
    expect(currentTotpStep(59_000)).toBe(1);
  });
});

describe("bid policy", () => {
  it("caps new unverified accounts and absurd jumps", async () => {
    const a = await auction({ startPrice: 20_000 });
    actor.id = users.fresh;
    const big = await bid(json({ amount: BID_POLICY.NEW_ACCOUNT_MAX_SAR + 1_000 }), ctx(a.id));
    expect(big.status).toBe(403);
    actor.id = users.vet;
    expect((await bid(json({ amount: 21_000 }), ctx(a.id))).status).toBe(200);
    const jump = maxBidFor(21_010) + 1;
    expect((await bid(json({ amount: jump }), ctx(a.id))).status).toBe(403);
  });

  it("refuses low-credibility bidders and bidders with unsettled wins", async () => {
    const a = await auction();
    await db.user.update({ where: { id: users.rival }, data: { credibility: 10 } });
    actor.id = users.rival;
    expect((await bid(json({ amount: 100 }), ctx(a.id))).status).toBe(403);
    await db.user.update({ where: { id: users.rival }, data: { credibility: 50 } });

    const other = await auction();
    await db.transaction.createMany({
      data: [1, 2].map(() => ({
        listingId: other.listingId,
        sellerId: users.seller,
        buyerId: users.rival,
        amount: 100,
        source: "AUCTION",
        deadline: new Date(Date.now() + 86_400_000),
      })),
    });
    expect((await bid(json({ amount: 100 }), ctx(a.id))).status).toBe(403);
    await db.transaction.deleteMany({ where: { buyerId: users.rival } });
    expect((await bid(json({ amount: 100 }), ctx(a.id))).status).toBe(200);
  });

  it("extends the auction when a proxy ceiling bids in the closing window", async () => {
    const a = await auction({ endsInMs: 60_000 });
    actor.id = users.vet;
    expect((await bid(json({ amount: 100 }), ctx(a.id))).status).toBe(200);
    // back into the closing window (the manual bid itself already extended it)
    const afterManual = await db.auction.update({
      where: { id: a.id },
      data: { endsAt: new Date(Date.now() + 60_000) },
    });
    actor.id = users.rival;
    expect((await proxy(json({ maxAmount: 500 }), ctx(a.id))).status).toBe(200);
    const afterProxy = await db.auction.findUniqueOrThrow({ where: { id: a.id } });
    expect(afterProxy.endsAt.getTime()).toBeGreaterThan(afterManual.endsAt.getTime());
  });
});

describe("seller block", () => {
  it("archives the blocked bidder's bids and audits the action", async () => {
    const a = await auction();
    actor.id = users.vet;
    await bid(json({ amount: 100 }), ctx(a.id));
    actor.id = users.rival;
    await bid(json({ amount: 200 }), ctx(a.id));
    const top = await db.bid.findFirstOrThrow({
      where: { auctionId: a.id, bidderId: users.rival },
    });
    actor.id = users.seller;
    expect((await block(json({ bidId: top.id }), ctx(a.id))).status).toBe(200);
    expect(await db.bid.count({ where: { auctionId: a.id, bidderId: users.rival } })).toBe(0);
    const archived = await db.voidedBid.findUniqueOrThrow({ where: { id: top.id } });
    expect(archived).toMatchObject({ reason: "SELLER_BLOCK", amount: 200 });
    expect(
      await db.auditLog.count({ where: { actorId: users.seller, action: "SELLER_BLOCK_BIDDER" } }),
    ).toBe(1);
  });

  it("is refused in the closing minutes", async () => {
    const a = await auction({ endsInMs: 5 * 60_000 });
    actor.id = users.vet;
    await bid(json({ amount: 100 }), ctx(a.id));
    const row = await db.bid.findFirstOrThrow({ where: { auctionId: a.id } });
    actor.id = users.seller;
    expect((await block(json({ bidId: row.id }), ctx(a.id))).status).toBe(409);
    expect(await db.bid.count({ where: { auctionId: a.id } })).toBe(1);
  });
});

it("never declares a banned bidder the winner", async () => {
  const a = await auction();
  await db.bid.createMany({
    data: [
      { auctionId: a.id, bidderId: users.vet, amount: 150, maskedName: "v" },
      { auctionId: a.id, bidderId: users.stranger, amount: 900, maskedName: "s" },
    ],
  });
  await db.user.update({ where: { id: users.stranger }, data: { isBanned: true } });
  await db.auction.update({ where: { id: a.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  await finalizeExpiredAuctions();
  const done = await db.auction.findUniqueOrThrow({ where: { id: a.id } });
  expect(done).toMatchObject({ status: "ENDED", winnerId: users.vet, winningBid: 150 });
  await db.user.update({ where: { id: users.stranger }, data: { isBanned: false } });
});

it("freezes a listing once an offer was accepted", async () => {
  const listing = await db.listing.create({
    data: {
      title: "Release fixture listing",
      description: "Temporary local fixture for the freeze test",
      city: "الرياض",
      price: 500,
      sellerId: users.seller,
      categoryId: category,
    },
  });
  listingIds.push(listing.id);
  await db.offer.create({
    data: { listingId: listing.id, buyerId: users.vet, amount: 450, status: "ACCEPTED" },
  });
  const fd = new FormData();
  fd.set("title", "Completely different item now");
  fd.set("description", "The seller tries to rewrite the agreed listing text");
  fd.set("city", "الرياض");
  fd.set("price", "999");
  actor.id = users.seller;
  const res = await editListing(
    new Request("http://localhost/release", { method: "PATCH", body: fd }),
    ctx(listing.id),
  );
  expect(res.status).toBe(409);
  expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).price).toBe(500);
});

it("requires an existing connection before a direct chat", async () => {
  actor.id = users.stranger;
  expect((await createConversation(json({ userId: users.fresh }))).status).toBe(403);
  await db.follow.create({ data: { followerId: users.stranger, sellerId: users.fresh } });
  expect((await createConversation(json({ userId: users.fresh }))).status).toBe(200);
});

it("claws back points when a paid invoice is refunded", async () => {
  vi.stubEnv("PAYMENTS_ENABLED", "true");
  vi.stubEnv("MOYASAR_SECRET_KEY", "sk_test_fixture");
  const invoiceId = `${prefix}-inv`;
  const fetchMock = vi.fn(async () =>
    Response.json({ id: invoiceId, status: "refunded", amount: 11500, currency: "SAR" }),
  );
  vi.stubGlobal("fetch", fetchMock);
  try {
    await db.user.update({ where: { id: users.vet }, data: { points: 150 } });
    const payment = await db.payment.create({
      data: {
        userId: users.vet,
        packageId: "fixture",
        points: 100,
        amount: 11500,
        status: "PAID",
        invoiceId,
      },
    });
    expect(await reversePaymentIfRefunded(payment.id)).toBe("refunded");
    expect(await reversePaymentIfRefunded(payment.id)).toBe("unchanged");
    expect((await db.user.findUniqueOrThrow({ where: { id: users.vet } })).points).toBe(50);
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      "REFUNDED",
    );
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("stores dispute photos privately and shows them only to the parties", async () => {
  const listing = await db.listing.create({
    data: {
      title: "Release fixture disputed",
      description: "Temporary local fixture for evidence photos",
      city: "الرياض",
      sellerId: users.seller,
      categoryId: category,
      status: "SOLD",
    },
  });
  listingIds.push(listing.id);
  const tx = await db.transaction.create({
    data: {
      listingId: listing.id,
      sellerId: users.seller,
      buyerId: users.vet,
      amount: 100,
      source: "STANDARD",
      status: "DISPUTED",
      deadline: new Date(Date.now() + 86_400_000),
    },
  });
  const dispute = await db.dispute.create({
    data: { transactionId: tx.id },
  });
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  const fd = new FormData();
  fd.set("note", "The item arrived broken, photo attached");
  fd.set("image", new File([new Uint8Array(png)], "proof.png", { type: "image/png" }));
  actor.id = users.vet;
  const res = await addEvidence(
    new Request("http://localhost/release", { method: "POST", body: fd }),
    ctx(tx.id),
  );
  expect(res.status).toBe(200);
  const evidence = await db.evidence.findFirstOrThrow({ where: { disputeId: dispute.id } });
  expect(evidence.fileUrl?.startsWith("private:evidence/")).toBe(true);
  const params = { params: Promise.resolve({ id: tx.id, evidenceId: evidence.id }) };
  actor.id = users.seller;
  expect((await evidenceImage(new Request("http://localhost/x"), params)).status).toBe(200);
  actor.id = users.stranger;
  expect((await evidenceImage(new Request("http://localhost/x"), params)).status).toBe(404);
  await db.evidence.deleteMany({ where: { disputeId: dispute.id } });
  await db.dispute.delete({ where: { id: dispute.id } });
  await deletePrivateImage(evidence.fileUrl!.slice("private:".length));
});
