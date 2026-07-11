"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adjustPoints } from "@/lib/points";
import { createInvoice, paymentsConfigured, totalWithVat, VAT_RATE } from "@/lib/payments";

/**
 * Buy a point package. With Moyasar keys configured this creates an invoice
 * and redirects to the hosted payment page (points are credited after the
 * payment is verified). Without keys (local dev) it credits instantly.
 */
export async function buyPointsAction(formData: FormData) {
  const user = await requireUser();
  const packageId = String(formData.get("packageId"));
  const pkg = await db.pointPackage.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.isActive) return;

  const totalPoints = pkg.points + pkg.bonus;

  if (!paymentsConfigured()) {
    // dev fallback — no gateway keys present
    await adjustPoints(user.id, totalPoints, `شراء ${pkg.points} نقطة (+${pkg.bonus} هدية)`);
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
      invoiceId: "pending", // replaced right after the invoice is created
    },
  });

  const invoice = await createInvoice({
    amountHalalas: amount,
    description: `حراج ستيشن — شحن ${pkg.points} نقطة${pkg.bonus ? ` (+${pkg.bonus} هدية)` : ""} — شامل ضريبة القيمة المضافة ${VAT_RATE * 100}%`,
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
