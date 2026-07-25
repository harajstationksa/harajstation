/**
 * Integration: buyer-requested extension of the mutual-confirmation deadline,
 * against the local dev DB. getSession is mocked so the route sees a caller;
 * everything else (rate limiter, notifications, expiry job) is the real thing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = { sub: "" };
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ ...session }) }));

import { db } from "@/lib/db";
import { expirePendingTransactions } from "@/lib/credibility";
import { POST as extensionPost } from "@/app/api/transactions/[id]/extension/route";

const stamp = Date.now();
let sellerId = "";
let buyerId = "";
let listingId = "";
let txId = "";

function call(id: string, body: unknown, ip: string) {
  return extensionPost(
    new Request(`http://localhost/api/transactions/${id}/extension`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": ip },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

/** Fresh PENDING transaction with a deadline a day out. */
async function newTx(deadline = new Date(Date.now() + 86_400_000)) {
  const t = await db.transaction.create({
    data: { listingId, sellerId, buyerId, amount: 1000, source: "STANDARD", deadline },
  });
  txId = t.id;
  return t;
}

beforeAll(async () => {
  const category = await db.category.upsert({
    where: { slug: `vitest-ext-${stamp}` },
    create: {
      slug: `vitest-ext-${stamp}`,
      nameAr: "اختبار",
      nameEn: "Test",
      icon: "Box",
    },
    update: {},
  });
  const mk = (role: string) =>
    db.user.create({
      data: {
        name: `vitest ${role}`,
        phone: `+9665${String(stamp).slice(-8)}${role === "seller" ? 1 : 2}`,
        email: `vitest-${role}-${stamp}@test.local`,
        passwordHash: "x",
        city: "الرياض",
      },
    });
  sellerId = (await mk("seller")).id;
  buyerId = (await mk("buyer")).id;
  listingId = (
    await db.listing.create({
      data: {
        title: "سلعة اختبار",
        description: "وصف اختبار للتمديد",
        price: 1000,
        condition: "USED",
        city: "الرياض",
        images: "[]",
        sellerId,
        categoryId: category.id,
      },
    })
  ).id;
});

afterAll(async () => {
  await db.transaction.deleteMany({ where: { listingId } });
  await db.notification.deleteMany({ where: { userId: { in: [sellerId, buyerId] } } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.user.deleteMany({ where: { id: { in: [sellerId, buyerId] } } });
  await db.category.deleteMany({ where: { slug: `vitest-ext-${stamp}` } });
});

describe("deadline extension", () => {
  it("lets the buyer ask and the seller approve, moving the deadline", async () => {
    const t = await newTx();

    session.sub = buyerId;
    expect((await call(t.id, { days: 5, note: "الشحن يتأخر" }, "10.1.0.1")).status).toBe(200);
    let row = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.extStatus).toBe("PENDING");
    expect(row.extDays).toBe(5);
    expect(row.deadline.getTime()).toBe(t.deadline.getTime()); // not yet moved

    session.sub = sellerId;
    expect((await call(t.id, { decision: "APPROVE" }, "10.1.0.2")).status).toBe(200);
    row = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.extStatus).toBe("APPROVED");
    expect(row.deadline.getTime()).toBe(t.deadline.getTime() + 5 * 86_400_000);
  });

  it("refuses a second request and a seller-side request", async () => {
    session.sub = buyerId;
    // the transaction from the previous test already carries an APPROVED ext
    expect((await call(txId, { days: 3 }, "10.1.0.3")).status).toBe(409);

    const t = await newTx();
    session.sub = sellerId;
    expect((await call(t.id, { days: 3 }, "10.1.0.4")).status).toBe(403);
  });

  it("rejects cleanly and leaves the deadline alone", async () => {
    const t = await newTx();
    session.sub = buyerId;
    await call(t.id, { days: 7 }, "10.1.0.5");
    session.sub = sellerId;
    expect((await call(t.id, { decision: "REJECT" }, "10.1.0.6")).status).toBe(200);
    const row = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.extStatus).toBe("REJECTED");
    expect(row.deadline.getTime()).toBe(t.deadline.getTime());
  });

  it("grants an undecided request instead of expiring the transaction", async () => {
    const t = await newTx();
    session.sub = buyerId;
    await call(t.id, { days: 3 }, "10.1.0.7");
    // deadline hits while the seller is still silent
    await db.transaction.update({
      where: { id: t.id },
      data: { deadline: new Date(Date.now() - 60_000) },
    });

    await expirePendingTransactions();

    const row = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.status).toBe("PENDING");
    expect(row.extStatus).toBe("APPROVED");
    expect(row.deadline.getTime()).toBeGreaterThan(Date.now());
  });
});
