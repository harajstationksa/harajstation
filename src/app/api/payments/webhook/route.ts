import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { confirmPayment, reversePaymentIfRefunded } from "@/lib/payments";
import { safeEqual } from "@/lib/crypto";
import { rateLimitGuard } from "@/lib/rate-limit";

/**
 * Moyasar webhook — the reliable path for crediting points (the success-page
 * redirect can be skipped by the user). Configure in the Moyasar dashboard:
 *   URL:    https://harajstation.com/api/payments/webhook
 *   Secret: MOYASAR_WEBHOOK_SECRET  (sent as `secret_token` in the payload)
 * Verification never trusts the payload — we re-fetch the invoice from the
 * Moyasar API before crediting.
 */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "payment-webhook", 120, 60_000);
  if (limited) return limited;
  const MAX_BODY = 64 * 1024;
  if (Number(req.headers.get("content-length")) > MAX_BODY)
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const secret = process.env.MOYASAR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) {
          await reader.cancel();
          return NextResponse.json({ error: "payload too large" }, { status: 413 });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const payload = (() => {
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return null;
    }
  })() as {
    secret_token?: string;
    type?: string;
    data?: { id?: string; invoice_id?: string; metadata?: Record<string, string> };
  } | null;

  if (
    !payload ||
    typeof payload.secret_token !== "string" ||
    !safeEqual(payload.secret_token, secret)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // invoice events carry the id directly; payment events reference invoice_id
  const invoiceId = payload.data?.invoice_id ?? payload.data?.id ?? "";
  if (typeof invoiceId !== "string" || !invoiceId || invoiceId.length > 120)
    return NextResponse.json({ ok: true, skipped: true });

  const payment = await db.payment.findUnique({ where: { invoiceId } });
  if (!payment) return NextResponse.json({ ok: true, skipped: true });

  // refunds/voids arrive for invoices we already credited
  const result =
    payment.status === "PAID"
      ? await reversePaymentIfRefunded(payment.id)
      : await confirmPayment(payment.id);
  return NextResponse.json({ ok: true, result });
}
