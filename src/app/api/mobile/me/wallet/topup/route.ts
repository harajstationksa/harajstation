import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { adjustPoints } from "@/lib/points";
import {
  createInvoice,
  paymentsConfigured,
  totalWithVat,
  VAT_RATE,
} from "@/lib/payments";
import { validatePromo, recordPromoRedemption } from "@/lib/promo";
import { awardReferralBonus } from "@/lib/referral";
import { isRateLimited } from "@/lib/rate-limit";

const schema = z.object({
  packageId: z.string().min(1),
  promo: z.string().optional(),
});

/**
 * Buy a point package — JSON twin of the wallet server action. With Moyasar
 * configured it returns { paymentUrl } for the app to open in a webview
 * (success lands on /dashboard/wallet/confirm); without keys (dev) the points
 * are credited instantly and { credited: true } is returned.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  if (await isRateLimited(`buy-points:${user.id}`, 8, 10 * 60_000)) {
    return NextResponse.json(
      { error: "محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً" },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const pkg = await db.pointPackage.findUnique({
    where: { id: parsed.data.packageId },
  });
  if (!pkg || !pkg.isActive) {
    return NextResponse.json({ error: "الباقة غير متاحة" }, { status: 404 });
  }

  let promoId: string | null = null;
  let promoBonus = 0;
  const promoInput = (parsed.data.promo ?? "").trim();
  if (promoInput) {
    const check = await validatePromo(promoInput, user.id);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    promoId = check.promo.id;
    promoBonus = Math.floor(((pkg.points + pkg.bonus) * check.promo.percent) / 100);
  }

  const totalPoints = pkg.points + pkg.bonus + promoBonus;

  if (!paymentsConfigured()) {
    await adjustPoints(
      user.id,
      totalPoints,
      `شراء ${pkg.points} نقطة (+${pkg.bonus} هدية${promoBonus ? ` +${promoBonus} كود خصم` : ""})`
    );
    if (promoId && promoBonus > 0) {
      await recordPromoRedemption({ promoId, userId: user.id, bonusPoints: promoBonus });
    }
    await awardReferralBonus(user.id, pkg.points + pkg.bonus);
    return NextResponse.json({ ok: true, credited: true, points: totalPoints });
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
      invoiceId: "pending",
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
    return NextResponse.json({ error: "تعذر إنشاء الفاتورة — حاول لاحقاً" }, { status: 502 });
  }

  await db.payment.update({
    where: { id: payment.id },
    data: { invoiceId: invoice.id },
  });

  return NextResponse.json({ ok: true, paymentUrl: invoice.url, paymentId: payment.id });
}
