import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { issueEmailVerification } from "@/lib/email-verify";
import { emailConfigured } from "@/lib/email";
import { isRateLimited, rateLimitGuard } from "@/lib/rate-limit";

/**
 * Re-send the confirmation email.
 *
 * Two callers: the dashboard banner (has a session), and the login screen after
 * a sign-in was refused for an unconfirmed address (has none — that's the whole
 * point). The second path takes the address in the body and always answers ok,
 * so it can't be used to discover which addresses have accounts.
 */
export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "verify-resend", 3, 10 * 60_000);
  if (limited) return limited;

  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "إرسال البريد غير مفعّل حالياً" },
      { status: 503 }
    );
  }

  const session = await getCurrentUser();

  // ── no session: someone the login screen just turned away ──
  if (!session) {
    const body = (await req.json().catch(() => null)) as { email?: string } | null;
    const email = body?.email?.toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (isRateLimited(`verify-resend:mail:${email}`, 5, 60 * 60_000)) {
      return NextResponse.json(
        { error: "أرسلنا رسائل كثيرة لهذا البريد — راجع صندوق الوارد والسبام" },
        { status: 429 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    // unknown address, already confirmed, or banned — same answer either way
    if (user && !user.emailVerifiedAt && !user.isBanned) {
      await issueEmailVerification(user.id, user.email);
    }
    return NextResponse.json({ ok: true });
  }

  // ── signed in: the dashboard banner ──
  if (session.emailVerifiedAt) {
    return NextResponse.json({ error: "بريدك مؤكد بالفعل" }, { status: 400 });
  }
  // the IP cap above doesn't stop the same account resending from many
  // networks — bound the account itself too
  if (isRateLimited(`verify-resend:u:${session.id}`, 5, 60 * 60_000)) {
    return NextResponse.json(
      { error: "أرسلنا رسائل تأكيد كثيرة — راجع بريدك (وصندوق الرسائل غير المرغوبة) أو انتظر قليلاً" },
      { status: 429 }
    );
  }

  await issueEmailVerification(session.id, session.email);
  return NextResponse.json({ ok: true });
}
