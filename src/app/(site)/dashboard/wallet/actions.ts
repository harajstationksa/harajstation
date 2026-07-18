"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adjustPoints } from "@/lib/points";
import { createInvoice, paymentsConfigured, totalWithVat, VAT_RATE } from "@/lib/payments";
import { validatePromo, recordPromoRedemption } from "@/lib/promo";
import { awardReferralBonus } from "@/lib/referral";
import { isRateLimited } from "@/lib/rate-limit";

/**
 * Buy a point package. With Moyasar keys configured this creates an invoice
 * and redirects to the hosted payment page (points are credited after the
 * payment is verified). Without keys (local dev) it credits instantly.
 * An optional promo code adds percent% bonus points on top of the package.
 */
export async function buyPointsAction(formData: FormData) {
  const user = await requireUser();
  // every attempt creates a Payment row + Moyasar invoice — cap per account
  if (await isRateLimited(`buy-points:${user.id}`, 8, 10 * 60_000)) {
    redirect(
      `/dashboard/wallet?promoError=${encodeURIComponent("محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً")}`
    );
  }
  const packageId = String(formData.get("packageId"));
  const promoInput = String(formData.get("promo") ?? "").trim();
  const pkg = await db.pointPackage.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.isActive) return;

  // promo code (optional): validated here, redeemed when the payment confirms
  let promoId: string | null = null;
  let promoBonus = 0;
  if (promoInput) {
    const check = await validatePromo(promoInput, user.id);
    if (!check.ok) {
      redirect(`/dashboard/wallet?promoError=${encodeURIComponent(check.error)}`);
    }
    promoId = check.promo.id;
    promoBonus = Math.floor(((pkg.points + pkg.bonus) * check.promo.percent) / 100);
  }

  const totalPoints = pkg.points + pkg.bonus + promoBonus;

  if (!paymentsConfigured()) {
    // dev fallback — no gateway keys present
    await adjustPoints(
      user.id,
      totalPoints,
      `شراء ${pkg.points} نقطة (+${pkg.bonus} هدية${promoBonus ? ` +${promoBonus} كود خصم` : ""})`
    );
    if (promoId && promoBonus > 0) {
      await recordPromoRedemption({ promoId, userId: user.id, bonusPoints: promoBonus });
    }
    await awardReferralBonus(user.id, pkg.points + pkg.bonus);
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard");
    return;
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const amount = totalWithVat(pkg.price);
  const payment = await db.payment.create({
    data: {
      userId: user.id,
      packageId: pkg.id,
      points: totalPoints,
      amount,
      promoCodeId: promoId,
      promoBonus,
      invoiceId: "pending", // replaced right after the invoice is created
    },
  });

  const invoice = await createInvoice({
    amountHalalas: amount,
    description: `حراج ستيشن — شحن ${pkg.points} نقطة${pkg.bonus ? ` (+${pkg.bonus} هدية)` : ""}${promoBonus ? ` (+${promoBonus} كود خصم)` : ""} — شامل ضريبة القيمة المضافة ${VAT_RATE * 100}%`,
    successUrl: `${site}/dashboard/wallet/confirm?p=${payment.id}`,
    backUrl: `${site}/dashboard/wallet`,
  });
  if (!invoice) {
    await db.payment.delete({ where: { id: payment.id } });
    redirect("/dashboard/wallet?error=payment");
  }

  await db.payment.update({
    where: { id: payment.id },
    data: { invoiceId: invoice.id },
  });

  redirect(invoice.url);
}
