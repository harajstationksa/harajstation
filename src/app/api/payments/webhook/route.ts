import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { confirmPayment } from "@/lib/payments";

/**
 * Moyasar webhook — the reliable path for crediting points (the success-page
 * redirect can be skipped by the user). Configure in the Moyasar dashboard:
 *   URL:    https://harajstation.com/api/payments/webhook
 *   Secret: MOYASAR_WEBHOOK_SECRET  (sent as `secret_token` in the payload)
 * Verification never trusts the payload — we re-fetch the invoice from the
 * Moyasar API before crediting.
 */
export async function POST(req: Request) {
  const secret = process.env.MOYASAR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const payload = (await req.json().catch(() => null)) as {
    secret_token?: string;
    type?: string;
    data?: { id?: string; invoice_id?: string; metadata?: Record<string, string> };
  } | null;

  if (!payload || payload.secret_token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // invoice events carry the id directly; payment events reference invoice_id
  const invoiceId = payload.data?.invoice_id ?? payload.data?.id ?? "";
  if (!invoiceId) return NextResponse.json({ ok: true, skipped: true });

  const payment = await db.payment.findUnique({ where: { invoiceId } });
  if (!payment) return NextResponse.json({ ok: true, skipped: true });

  const result = await confirmPayment(payment.id);
  return NextResponse.json({ ok: true, result });
}
