import { db } from "./db";
import { adjustPointsWithClient } from "./points";
import { getReferralConfig } from "./referral";
import { notify } from "./notify";

/**
 * Moyasar integration (invoice flow):
 *   buy → create local Payment (PENDING) + Moyasar invoice → redirect to the
 *   hosted payment page → Moyasar redirects back / fires a webhook → we verify
 *   the invoice server-side and credit the points exactly once.
 *
 * Amounts are in halalas and include 15% VAT on top of the package price.
 */

const API = "https://api.moyasar.com/v1";
export const VAT_RATE = 0.15;

export function paymentsConfigured() {
  return process.env.PAYMENTS_ENABLED === "true" && !!process.env.MOYASAR_SECRET_KEY;
}

function authHeader() {
  return `Basic ${Buffer.from(`${process.env.MOYASAR_SECRET_KEY}:`).toString("base64")}`;
}

/** Package price (SAR) → total in halalas including VAT. */
export function totalWithVat(priceSar: number): number {
  return Math.round(priceSar * (1 + VAT_RATE) * 100);
}

export async function createInvoice(opts: {
  amountHalalas: number;
  description: string;
  successUrl: string;
  backUrl: string;
}): Promise<{ id: string; url: string } | null> {
  try {
    const res = await fetch(`${API}/invoices`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: opts.amountHalalas,
        currency: "SAR",
        description: opts.description,
        success_url: opts.successUrl,
        back_url: opts.backUrl,
      }),
    });
    if (!res.ok) {
      console.error("moyasar create invoice failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { id: string; url: string };
    return { id: data.id, url: data.url };
  } catch (e) {
    console.error("moyasar request failed:", e);
    return null;
  }
}

async function fetchInvoiceStatus(invoiceId: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/invoices/${invoiceId}`, {
      headers: { Authorization: authHeader() },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string };
    return data.status;
  } catch {
    return null;
  }
}

/**
 * Verify a pending payment against Moyasar and credit the points.
 * Idempotent: the PENDING→PAID flip uses updateMany as a guard, so the
 * webhook and the success-page callback can both call this safely.
 */
export async function confirmPayment(
  paymentId: string
): Promise<"paid" | "pending" | "failed" | "not_found"> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return "not_found";
  if (payment.status === "PAID") return "paid";
  if (payment.status === "FAILED") return "failed";

  if (!paymentsConfigured() || !payment.invoiceId) return "pending";
  const status = await fetchInvoiceStatus(payment.invoiceId);
  if (status !== "paid") {
    if (status === "expired" || status === "canceled" || status === "failed") {
      await db.payment.updateMany({
        where: { id: paymentId, status: "PENDING" },
        data: { status: "FAILED" },
      });
      return "failed";
    }
    return "pending";
  }

  const referralConfig = await getReferralConfig();
  let referralNotice: { userId: string; buyerName: string; reward: number } | null = null;

  // The status flip, user balance, point ledger, promo counters and referral
  // reward commit together. Advisory locks serialize the two public callbacks
  // without leaving a half-paid row if any later step fails.
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment:${paymentId}`}))`;
    const current = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!current || current.status !== "PENDING") return;

    let creditPoints = current.points;
    let appliedPromoBonus = current.promoBonus;
    let appliedPromoId = current.promoCodeId;

    if (appliedPromoId && appliedPromoBonus > 0) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promo:${appliedPromoId}:${current.userId}`}))`;
      const promo = await tx.promoCode.findUnique({ where: { id: appliedPromoId } });
      const alreadyUsed = promo?.oncePerUser
        ? await tx.promoRedemption.findFirst({
            where: { promoId: appliedPromoId, userId: current.userId },
            select: { id: true },
          })
        : null;
      const eligible =
        !!promo &&
        promo.isActive &&
        (!promo.expiresAt || promo.expiresAt >= new Date()) &&
        (promo.maxUses === 0 || promo.usedCount < promo.maxUses) &&
        !alreadyUsed;

      if (eligible && promo) {
        const reserved = await tx.promoCode.updateMany({
          where: {
            id: promo.id,
            isActive: true,
            OR: [{ maxUses: 0 }, { usedCount: { lt: promo.maxUses } }],
          },
          data: { usedCount: { increment: 1 } },
        });
        if (reserved.count === 1) {
          await tx.promoRedemption.create({
            data: {
              promoId: promo.id,
              userId: current.userId,
              bonusPoints: appliedPromoBonus,
              paymentId: current.id,
              eligibilityKey: promo.oncePerUser
                ? `${promo.id}:${current.userId}`
                : null,
            },
          });
        } else {
          creditPoints -= appliedPromoBonus;
          appliedPromoBonus = 0;
          appliedPromoId = null;
        }
      } else {
        creditPoints -= appliedPromoBonus;
        appliedPromoBonus = 0;
        appliedPromoId = null;
      }
    }

    const newBalance = await adjustPointsWithClient(
      tx,
      current.userId,
      creditPoints,
      appliedPromoBonus > 0
        ? `شحن ${creditPoints} نقطة (منها ${appliedPromoBonus} بونص كود خصم) — دفع إلكتروني`
        : `شحن ${creditPoints} نقطة — دفع إلكتروني`
    );
    if (newBalance === null) throw new Error("Payment user no longer exists");

    if (referralConfig.enabled && referralConfig.percent > 0) {
      const buyer = await tx.user.findUnique({
        where: { id: current.userId },
        select: { name: true, referredById: true },
      });
      const purchased = creditPoints - appliedPromoBonus;
      const reward = Math.floor((purchased * referralConfig.percent) / 100);
      if (buyer?.referredById && buyer.referredById !== current.userId && reward > 0) {
        const refBalance = await adjustPointsWithClient(
          tx,
          buyer.referredById,
          reward,
          `مكافأة إحالة ${referralConfig.percent}% — شحن ${buyer.name} ${purchased.toLocaleString("en-US")} نقطة`
        );
        if (refBalance !== null) {
          await tx.referralEarning.create({
            data: {
              referrerId: buyer.referredById,
              referredId: current.userId,
              paymentId: current.id,
              points: reward,
            },
          });
          referralNotice = { userId: buyer.referredById, buyerName: buyer.name, reward };
        }
      }
    }

    await tx.payment.update({
      where: { id: current.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        points: creditPoints,
        promoBonus: appliedPromoBonus,
        promoCodeId: appliedPromoId,
      },
    });
  });

  if (referralNotice) {
    const notice = referralNotice as { userId: string; buyerName: string; reward: number };
    await notify(
      notice.userId,
      "SYSTEM",
      "مكافأة إحالة 🎁",
      `حصلت على ${notice.reward.toLocaleString("en-US")} نقطة لأن ${notice.buyerName} شحن رصيده عبر كود إحالتك`,
      "/dashboard/referrals"
    ).catch(() => {});
  }
  return "paid";
}
