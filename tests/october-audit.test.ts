import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { randomUUID, createCipheriv, createHash } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
const state = vi.hoisted(() => ({ actor: "", codes: [] as string[], mail: true, ip: 0 }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getCurrentUser: async () =>
    (await import("@/lib/db")).db.user.findUnique({ where: { id: state.actor } }),
  getSession: async () => ({
    sub: state.actor,
    role: "USER",
    name: "Audit user",
    sessionVersion: 1,
  }),
}));
vi.mock("@/lib/email", () => ({
  emailConfigured: () => state.mail,
  sendEmail: async () => true,
  sendLoginCodeEmail: async (_email: string, code: string) => {
    state.codes.push(code);
    return true;
  },
}));
vi.mock("@/lib/email-verify", () => ({ issueEmailVerification: async () => true }));
import { POST as storeEdit } from "@/app/api/store/route";
import { apiMessage } from "@/lib/api-messages";
import { db } from "@/lib/db";
import { POST as deleteAccount } from "@/app/api/account/delete/route";
import { PATCH as updateAccount } from "@/app/api/account/route";
import { POST as createConversation } from "@/app/api/conversations/route";
import {
  POST as sendMessage,
  GET as readMessages,
} from "@/app/api/conversations/[id]/messages/route";
import { POST as block } from "@/app/api/account/blocks/route";
import { POST as confirm } from "@/app/api/transactions/[id]/confirm/route";
import { POST as webhook } from "@/app/api/payments/webhook/route";
import { generateListingRef } from "@/lib/ref";
import { withOperationalLease } from "@/lib/operational-lease";
import { finalizeExpiredAuctions } from "@/lib/auction";
import { saveImages, savePrivateImage, privateUploadPath, privateUploadsRoot } from "@/lib/uploads";
import { privateImageResponse } from "@/lib/private-storage";
import { decryptText, encryptText } from "@/lib/crypto";
import { contentSecurityPolicy } from "@/lib/csp";
import { confirmPayment } from "@/lib/payments";
import { privateR2Configured } from "@/lib/private-r2";
const prefix = "oct-" + randomUUID().slice(0, 8);
const users = [0, 1, 2, 3].map((n) => prefix + "-" + n);
let categoryId = "",
  listingId = "";
function request(data: unknown = {}, url = "/api/test", method = "POST") {
  return new Request("http://localhost" + url, {
    method,
    headers: { "Content-Type": "application/json", "x-real-ip": "10.97.0." + ++state.ip },
    body: method === "GET" ? undefined : JSON.stringify(data),
  });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });
beforeAll(async () => {
  await db.user.createMany({
    data: users.map((id) => ({
      id,
      name: "October audit",
      email: id + "@example.invalid",
      passwordHash: "oauth:google:" + randomUUID(),
      city: "الرياض",
      emailVerifiedAt: new Date(),
      sessionVersion: 1,
    })),
  });
  categoryId = (
    await db.category.create({
      data: { slug: prefix, nameAr: prefix, nameEn: prefix, icon: "Box" },
    })
  ).id;
  listingId = (
    await db.listing.create({
      data: {
        id: prefix + "-listing",
        sellerId: users[1],
        categoryId,
        title: "October audit listing",
        description: "Only local audit test content",
        city: "الرياض",
      },
    })
  ).id;
});
beforeEach(() => {
  state.actor = users[0];
  vi.unstubAllGlobals();
});
afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await db.backgroundJob.deleteMany({ where: { payload: { contains: prefix } } });
  await db.review.deleteMany({ where: { transaction: { listingId } } });
  await db.dispute.deleteMany({ where: { transaction: { listing: { sellerId: { in: users } } } } });
  await db.transaction.deleteMany({
    where: { OR: [{ buyerId: { in: users } }, { sellerId: { in: users } }] },
  });
  await db.payment.deleteMany({ where: { userId: { in: users } } });
  await db.pointTransaction.deleteMany({ where: { userId: { in: users } } });
  await db.conversation.deleteMany({
    where: { OR: [{ buyerId: { in: users } }, { sellerId: { in: users } }] },
  });
  await db.bid.deleteMany({ where: { bidderId: { in: users } } });
  await db.listing.deleteMany({ where: { sellerId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.category.deleteMany({ where: { id: categoryId } });
});
it("OAuth deletion requires delivered, purpose-bound OTP and actually anonymizes the account", async () => {
  state.actor = users[3];
  const user = await db.user.findUniqueOrThrow({ where: { id: state.actor } });
  const proof = await (await deleteAccount(request({}))).json();
  expect(proof.requiresOtp).toBe(true);
  const code = state.codes.at(-1)!;
  const wrong = await deleteAccount(
    request({ challenge: proof.challenge, code: code === "111111" ? "222222" : "111111" }),
  );
  expect(wrong.status).toBe(409);
  expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).isBanned).toBe(false);
  const done = await deleteAccount(request({ challenge: proof.challenge, code }));
  expect(done.status).toBe(200);
  const deleted = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(deleted.isBanned).toBe(true);
  expect(deleted.email).toContain("@deleted.invalid");
  expect(deleted.googleSub).toBeNull();
  expect(deleted.sessionVersion).toBe(2);
});
it("OAuth email change works without an unavailable password, but only after OTP", async () => {
  state.actor = users[2];
  const email = prefix + "-new@example.invalid";
  const first = await updateAccount(
    request({ email, name: "October audit", city: "الرياض" }, "/api/account", "PATCH"),
  );
  const proof = await first.json();
  expect(proof.requiresOtp).toBe(true);
  const result = await updateAccount(
    request(
      {
        email,
        name: "October audit",
        city: "الرياض",
        challenge: proof.challenge,
        code: state.codes.at(-1),
      },
      "/api/account",
      "PATCH",
    ),
  );
  expect(result.status).toBe(200);
  expect((await db.user.findUniqueOrThrow({ where: { id: users[2] } })).email).toBe(email);
});
it("Rejects missing or unrelated buyers and hidden listings before FK writes", async () => {
  state.actor = users[1];
  expect((await createConversation(request({ listingId, buyerId: "does-not-exist" }))).status).toBe(
    404,
  );
  expect((await createConversation(request({ listingId, buyerId: users[0] }))).status).toBe(403);
  state.actor = users[0];
  await db.listing.update({ where: { id: listingId }, data: { status: "REMOVED" } });
  expect((await createConversation(request({ listingId }))).status).toBe(409);
  await db.listing.update({ where: { id: listingId }, data: { status: "ACTIVE" } });
});
it("Concurrent direct conversation creation produces one symmetric thread", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => createConversation(request({ userId: users[1] }))),
  );
  const ids = await Promise.all(results.map(async (r) => (await r.json()).id));
  expect(new Set(ids).size).toBe(1);
  state.actor = users[1];
  expect((await (await createConversation(request({ userId: users[0] }))).json()).id).toBe(ids[0]);
});
it("Concurrent chat messages create one unread notification and record first seller reply once", async () => {
  const conv = await db.conversation.create({
    data: { listingId, buyerId: users[0], sellerId: users[1] },
  });
  expect((await sendMessage(request({ body: "A buyer message" }), context(conv.id))).status).toBe(
    200,
  );
  state.actor = users[1];
  const sent = await Promise.all([
    sendMessage(request({ body: "First reply" }), context(conv.id)),
    sendMessage(request({ body: "Concurrent reply" }), context(conv.id)),
  ]);
  expect(sent.map((r) => r.status)).toEqual([200, 200]);
  expect((await db.user.findUniqueOrThrow({ where: { id: users[1] } })).responseCount).toBe(1);
  expect(
    await db.notification.count({
      where: {
        userId: users[0],
        link: `/dashboard/messages/${conv.id}`,
        type: "MESSAGE",
        readAt: null,
      },
    }),
  ).toBe(1);
  const stored = await db.message.findFirstOrThrow({ where: { conversationId: conv.id } });
  expect(stored.body).toMatch(/^enc:v3:/);
  state.actor = users[0];
  expect((await readMessages(request({}, "/api/thread", "GET"), context(conv.id))).status).toBe(
    200,
  );
  expect((await block(request({ userId: users[1] }))).status).toBe(200);
  expect((await sendMessage(request({ body: "Blocked" }), context(conv.id))).status).toBe(403);
  expect((await createConversation(request({ userId: users[1] }))).status).toBe(403);
  await db.userBlock.deleteMany({ where: { blockerId: users[0] } });
  await db.user.update({ where: { id: users[1] }, data: { isBanned: true } });
  expect(
    (await sendMessage(request({ body: "Banned counterpart" }), context(conv.id))).status,
  ).toBe(403);
  await db.user.update({ where: { id: users[1] }, data: { isBanned: false } });
  await db.listing.update({ where: { id: listingId }, data: { status: "REMOVED" } });
  expect((await sendMessage(request({ body: "Hidden ad" }), context(conv.id))).status).toBe(403);
  await db.listing.update({ where: { id: listingId }, data: { status: "ACTIVE" } });
});
it("Conflicting confirmation answers cannot overwrite each other or expired state", async () => {
  const tx = await db.transaction.create({
    data: {
      listingId,
      sellerId: users[1],
      buyerId: users[0],
      amount: 100,
      source: "STANDARD",
      deadline: new Date(Date.now() + 60000),
    },
  });
  const results = await Promise.all([
    confirm(request({ answer: "YES" }), context(tx.id)),
    confirm(request({ answer: "NO" }), context(tx.id)),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const saved = await db.transaction.findUniqueOrThrow({ where: { id: tx.id } });
  expect(["YES", "NO"]).toContain(saved.buyerAnswer);
  const expired = await db.transaction.create({
    data: {
      listingId,
      sellerId: users[1],
      buyerId: users[0],
      amount: 100,
      source: "STANDARD",
      deadline: new Date(Date.now() - 1000),
    },
  });
  expect((await confirm(request({ answer: "YES" }), context(expired.id))).status).toBe(409);
  expect(
    (await db.transaction.findUniqueOrThrow({ where: { id: expired.id } })).buyerAnswer,
  ).toBeNull();
});
it("Operational lease excludes concurrent workers, releases on failure, and recovers expired owners", async () => {
  const key = prefix + "-lease";
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const hold = new Promise<void>((r) => {
    release = r;
  });
  const first = withOperationalLease(key, async () => {
    entered();
    await hold;
    return "first";
  });
  await ready;
  expect(await withOperationalLease(key, async () => "second")).toBeNull();
  release();
  expect(await first).toBe("first");
  await expect(
    withOperationalLease(key, async () => {
      throw Error("test-failure");
    }),
  ).rejects.toThrow("test-failure");
  expect(await db.operationalLease.findUnique({ where: { key } })).toBeNull();
  await db.operationalLease.create({
    data: { key, owner: "crashed", expiresAt: new Date(Date.now() - 1000) },
  });
  expect(await withOperationalLease(key, async () => "recovered")).toBe("recovered");
});
it("Reference allocation is atomic across users and rolls back with a failed transaction", async () => {
  const refs = await Promise.all(
    Array.from({ length: 12 }, () =>
      db.$transaction((tx) => generateListingRef(tx), { timeout: 15000 }),
    ),
  );
  expect(new Set(refs).size).toBe(12);
  const before = await db.setting.findUnique({ where: { key: "LISTING_SEQ" } });
  await expect(
    db.$transaction(async (tx) => {
      await generateListingRef(tx);
      throw Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(await db.setting.findUnique({ where: { key: "LISTING_SEQ" } })).toEqual(before);
});
it("Auction cancellation notifies bidders and removes proxy ceilings", async () => {
  const listing = await db.listing.create({
    data: {
      sellerId: users[1],
      categoryId,
      title: "Cancelled audit auction",
      description: "local audit",
      city: "الرياض",
      type: "AUCTION",
      status: "REMOVED",
    },
  });
  const auction = await db.auction.create({
    data: { listingId: listing.id, startPrice: 100, endsAt: new Date(Date.now() + 60000) },
  });
  await db.bid.create({
    data: { auctionId: auction.id, bidderId: users[0], amount: 100, maskedName: "audit" },
  });
  await db.proxyBid.create({ data: { auctionId: auction.id, bidderId: users[0], maxAmount: 500 } });
  await finalizeExpiredAuctions();
  expect((await db.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe(
    "CANCELLED",
  );
  expect(await db.proxyBid.count({ where: { auctionId: auction.id } })).toBe(0);
  expect(
    await db.notification.count({
      where: { userId: users[0], eventKey: `auction-cancelled:${auction.id}:${users[0]}` },
    }),
  ).toBe(1);
});
it("Expired auctions choose the earlier bid on ties and finalize only once", async () => {
  const listing = await db.listing.create({
    data: {
      sellerId: users[1],
      categoryId,
      title: "Tied audit auction",
      description: "local audit",
      city: "الرياض",
      type: "AUCTION",
    },
  });
  const auction = await db.auction.create({
    data: { listingId: listing.id, startPrice: 100, endsAt: new Date(Date.now() - 1000) },
  });
  await db.bid.createMany({
    data: [
      {
        auctionId: auction.id,
        bidderId: users[0],
        amount: 100,
        maskedName: "first",
        createdAt: new Date(Date.now() - 60000),
      },
      {
        auctionId: auction.id,
        bidderId: users[2],
        amount: 100,
        maskedName: "second",
        createdAt: new Date(Date.now() - 30000),
      },
    ],
  });
  await Promise.all([finalizeExpiredAuctions(), finalizeExpiredAuctions()]);
  expect((await db.auction.findUniqueOrThrow({ where: { id: auction.id } })).winnerId).toBe(
    users[0],
  );
  expect(await db.transaction.count({ where: { auctionId: auction.id } })).toBe(1);
});
it.each([
  ["USD", 1000],
  ["SAR", 999],
])(
  "Does not credit a paid invoice with mismatched currency/amount (%s)",
  async (currency, amount) => {
    vi.stubEnv("PAYMENTS_ENABLED", "true");
    vi.stubEnv("MOYASAR_SECRET_KEY", "local-test");
    const p = await db.payment.create({
      data: {
        userId: users[0],
        packageId: "test",
        amount: 1000,
        points: 50,
        invoiceId: randomUUID(),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: p.invoiceId, status: "paid", amount, currency })),
    );
    const before = (await db.user.findUniqueOrThrow({ where: { id: users[0] } })).points;
    expect(await confirmPayment(p.id)).toBe("failed");
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PENDING");
    expect((await db.user.findUniqueOrThrow({ where: { id: users[0] } })).points).toBe(before);
  },
);
it("Webhook rejects oversized streamed bodies before querying payments", async () => {
  vi.stubEnv("MOYASAR_WEBHOOK_SECRET", "local-webhook-secret");
  const res = await webhook(
    new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: { "x-real-ip": "10.97.10.1" },
      body: "x".repeat(65537),
    }),
  );
  expect(res.status).toBe(413);
});
it("All untrusted image entry points reject a pixel bomb before decompression", async () => {
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } })
    .png()
    .toBuffer();
  png.writeUInt32BE(16000, 16);
  png.writeUInt32BE(16000, 20);
  const file = new File([Uint8Array.from(png)], "bomb.png", { type: "image/png" });
  expect((await saveImages([file])).ok).toBe(false);
  expect((await savePrivateImage(file, "chat")).ok).toBe(false);
});
it("Private images stream with no-store headers and traversal is refused", async () => {
  const dir = join(privateUploadsRoot(), prefix);
  await mkdir(dir, { recursive: true });
  const name = randomUUID() + ".webp";
  const path = prefix + "/" + name;
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } })
    .webp()
    .toBuffer();
  await writeFile(join(dir, name), bytes);
  try {
    const res = await privateImageResponse(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
    expect(privateUploadPath("../.env")).toBeNull();
    expect((await privateImageResponse("../.env")).status).toBe(400);
  } finally {
    await unlink(join(dir, name));
  }
});
it("Legacy v2 decrypts with explicit keys; AUTH_SECRET alone never supplies a chat key", () => {
  const old = "legacy-chat-key-32-characters-long";
  const iv = Buffer.alloc(12, 7),
    key = createHash("sha256")
      .update("chat|" + old)
      .digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const bytes = Buffer.concat([cipher.update("legacy body", "utf8"), cipher.final()]);
  const kid = createHash("sha256")
    .update("kid|" + old)
    .digest("hex")
    .slice(0, 16);
  const legacy = `enc:v2:${kid}:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${bytes.toString("base64")}`;
  vi.stubEnv("AUTH_SECRET", old);
  vi.stubEnv("CHAT_SECRET_PREVIOUS", "");
  vi.stubEnv("CHAT_LEGACY_AUTH_SECRET", "");
  expect(decryptText(legacy)).toMatch(/^⚠️/);
  vi.stubEnv("CHAT_SECRET_PREVIOUS", old);
  expect(decryptText(legacy)).toBe("legacy body");
  const encrypted = encryptText("new body");
  expect(encrypted.startsWith("enc:v3:")).toBe(true);
  expect(decryptText(encrypted)).toBe("new body");
  expect(decryptText(encrypted.slice(0, -4) + "AAAA")).toMatch(/^⚠️/);
});
it("CSP limits images to known hosts and private/public R2 buckets cannot be shared", () => {
  const csp = contentSecurityPolicy("test-nonce");
  expect(csp.split("; ").find((p) => p.startsWith("img-src"))).not.toMatch(
    /(?:^|\s)https:(?:\s|$)/,
  );
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("style-src-attr 'unsafe-inline'");
  expect(csp).toContain("style-src 'self' 'nonce-test-nonce'");
  vi.stubEnv("R2_PRIVATE_BUCKET", "public-bucket");
  vi.stubEnv("R2_BUCKET", "public-bucket");
  expect(() => privateR2Configured()).toThrow("must differ");
});

it("Concurrent store edits claiming the same slug return a conflict rather than 500", async () => {
  const first = await db.store.create({
    data: { userId: users[0], name: "Audit store one", slug: prefix + "-one" },
  });
  const second = await db.store.create({
    data: { userId: users[0], name: "Audit store two", slug: prefix + "-two" },
  });
  const results = await Promise.all([
    storeEdit(request({ storeId: first.id, name: first.name, slug: prefix + "-shared" })),
    storeEdit(request({ storeId: second.id, name: second.name, slug: prefix + "-shared" })),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
});
it("English language cookies receive centrally translated API errors", () => {
  const english = new Request("http://localhost/api/test", {
    headers: { cookie: "samel_lang=en" },
  });
  expect(apiMessage(english, "كلمة المرور غير صحيحة")).toBe("Incorrect password.");
  expect(apiMessage(english, "خطأ جديد غير مترجم")).not.toMatch(/[\u0600-\u06ff]/);
  expect(apiMessage(new Request("http://localhost"), "كلمة المرور غير صحيحة")).toBe(
    "كلمة المرور غير صحيحة",
  );
});
