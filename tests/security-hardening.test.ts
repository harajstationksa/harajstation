import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { safeBannerEmbedUrl } from "@/lib/banner-embed";
import { decryptText, encryptText } from "@/lib/crypto";
import { confirmPayment } from "@/lib/payments";
import { adjustPoints, claimDailyPoints } from "@/lib/points";
import { hashOneTimeToken } from "@/lib/tokens";

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let userId = "";
const originalChat = process.env.CHAT_SECRET;
const originalPrevious = process.env.CHAT_SECRET_PREVIOUS;
const originalPayments = process.env.PAYMENTS_ENABLED;
const originalMoyasar = process.env.MOYASAR_SECRET_KEY;

beforeAll(async () => {
  userId = (
    await db.user.create({
      data: {
        name: "security test",
        email: `security-${stamp}@test.local`,
        passwordHash: "x",
        city: "الرياض",
        points: 100,
      },
    })
  ).id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("CHAT_SECRET", originalChat);
  restore("CHAT_SECRET_PREVIOUS", originalPrevious);
  restore("PAYMENTS_ENABLED", originalPayments);
  restore("MOYASAR_SECRET_KEY", originalMoyasar);
  await db.payment.deleteMany({ where: { userId } });
  await db.pointTransaction.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
});

describe("security primitives", () => {
  it("hashes opaque email/reset tokens without storing the raw value", () => {
    expect(hashOneTimeToken("secret-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOneTimeToken("secret-token")).toBe(hashOneTimeToken("secret-token"));
    expect(hashOneTimeToken("other-token")).not.toBe(hashOneTimeToken("secret-token"));
  });

  it("rotates chat keys while retaining explicitly configured read keys", () => {
    const oldKey = "o".repeat(48);
    const newKey = "n".repeat(48);
    process.env.CHAT_SECRET = oldKey;
    process.env.CHAT_SECRET_PREVIOUS = "";
    const encrypted = encryptText("رسالة خاصة");
    expect(encrypted).toMatch(/^enc:v2:[a-f0-9]{16}:/);

    process.env.CHAT_SECRET = newKey;
    process.env.CHAT_SECRET_PREVIOUS = oldKey;
    expect(decryptText(encrypted)).toBe("رسالة خاصة");
    process.env.CHAT_SECRET_PREVIOUS = "";
    expect(decryptText(encrypted)).toMatch(/^⚠️/);
  });

  it("accepts only allow-listed HTTPS video embeds", () => {
    expect(safeBannerEmbedUrl("https://www.youtube.com/embed/abc123")).toBe(
      "https://www.youtube.com/embed/abc123"
    );
    expect(safeBannerEmbedUrl('<iframe src="https://player.vimeo.com/video/123"></iframe>')).toBe(
      "https://player.vimeo.com/video/123"
    );
    expect(safeBannerEmbedUrl('<img src=x onerror="alert(1)">')).toBeNull();
    expect(safeBannerEmbedUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("atomic points and payment", () => {
  it("allows only one of two concurrent spends against the same balance", async () => {
    await db.user.update({ where: { id: userId }, data: { points: 100 } });
    const results = await Promise.all([
      adjustPoints(userId, -60, "concurrent spend A"),
      adjustPoints(userId, -60, "concurrent spend B"),
    ]);
    expect(results.filter((value) => value !== null)).toHaveLength(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).points).toBe(40);
  });

  it("grants a daily claim once under concurrency", async () => {
    await db.user.update({
      where: { id: userId },
      data: { points: 0, lastDailyAt: null },
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const results = await Promise.all([
      claimDailyPoints(userId, 5, today),
      claimDailyPoints(userId, 5, today),
    ]);
    expect(results.filter((value) => value !== null)).toHaveLength(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).points).toBe(5);
  });

  it("credits a paid invoice exactly once when callback and webhook race", async () => {
    process.env.PAYMENTS_ENABLED = "true";
    process.env.MOYASAR_SECRET_KEY = "test-secret";
    await db.user.update({ where: { id: userId }, data: { points: 0 } });
    const payment = await db.payment.create({
      data: {
        userId,
        packageId: "test-package",
        points: 250,
        amount: 1150,
        invoiceId: `invoice-${stamp}`,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "paid" }), { status: 200 }))
    );

    expect(await Promise.all([confirmPayment(payment.id), confirmPayment(payment.id)])).toEqual([
      "paid",
      "paid",
    ]);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).points).toBe(250);
    expect(
      await db.pointTransaction.count({
        where: { userId, reason: { contains: "دفع إلكتروني" } },
      })
    ).toBe(1);
  });
});
