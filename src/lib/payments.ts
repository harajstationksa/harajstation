import { db } from "./db";
import { adjustPoints } from "./points";
import { awardReferralBonus } from "./referral";
import { recordPromoRedemption } from "./promo";

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
  return !!process.env.MOYASAR_SECRET_KEY;
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

  // exactly-once credit: only the caller that flips PENDING→PAID credits
  const flipped = await db.payment.updateMany({
    where: { id: paymentId, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (flipped.count === 1) {
    await adjustPoints(
      payment.userId,
      payment.points,
      payment.promoBonus > 0
        ? `شحن ${payment.points} نقطة (منها ${payment.promoBonus} بونص كود خصم) — دفع إلكتروني`
        : `شحن ${payment.points} نقطة — دفع إلكتروني`
    );
    if (payment.promoCodeId && payment.promoBonus > 0) {
      await recordPromoRedemption({
        promoId: payment.promoCodeId,
        userId: payment.userId,
        bonusPoints: payment.promoBonus,
        paymentId: payment.id,
      });
    }
    // referral commission on the paid package (excluding the promo bonus)
    await awardReferralBonus(payment.userId, payment.points - payment.promoBonus, payment.id);
  }
  return "paid";
}
