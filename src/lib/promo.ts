import type { PromoCode } from "@prisma/client";
import { db } from "./db";

/**
 * Promo codes: admin-created codes that add `percent`% bonus points on top of
 * a points top-up. Validated when the purchase starts; the redemption is
 * recorded (and usedCount incremented) only when the payment confirms.
 */

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export type PromoCheck =
  | { ok: true; promo: PromoCode }
  | { ok: false; error: string };

/** Full eligibility check for `userId` applying `code` right now. */
export async function validatePromo(rawCode: string, userId: string): Promise<PromoCheck> {
  const code = normalizePromoCode(rawCode);
  if (!code) return { ok: false, error: "أدخل كود الخصم" };

  const promo = await db.promoCode.findUnique({ where: { code } });
  if (!promo || !promo.isActive) {
    return { ok: false, error: "كود غير صحيح أو غير مفعّل" };
  }
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    return { ok: false, error: "انتهت صلاحية هذا الكود" };
  }
  if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
    return { ok: false, error: "استُنفدت مرات استخدام هذا الكود" };
  }
  if (promo.oncePerUser) {
    const used = await db.promoRedemption.findFirst({
      where: { promoId: promo.id, userId },
    });
    if (used) return { ok: false, error: "سبق أن استخدمت هذا الكود" };
  }
  return { ok: true, promo };
}

/**
 * Record a confirmed promo use. Guarded by paymentId uniqueness so the
 * webhook and the success callback can't double-record. Never throws.
 */
export async function recordPromoRedemption(opts: {
  promoId: string;
  userId: string;
  bonusPoints: number;
  paymentId?: string;
}): Promise<void> {
  try {
    await db.$transaction([
      db.promoRedemption.create({
        data: {
          promoId: opts.promoId,
          userId: opts.userId,
          bonusPoints: opts.bonusPoints,
          paymentId: opts.paymentId ?? null,
        },
      }),
      db.promoCode.update({
        where: { id: opts.promoId },
        data: { usedCount: { increment: 1 } },
      }),
    ]);
  } catch (e) {
    console.error("promo redemption record failed:", e);
  }
}
