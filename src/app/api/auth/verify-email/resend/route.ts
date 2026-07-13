import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { issueEmailVerification } from "@/lib/email-verify";
import { emailConfigured } from "@/lib/email";
import { isRateLimited, rateLimitGuard } from "@/lib/rate-limit";

/** Re-send the confirmation email (dashboard banner button). */
export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "verify-resend", 3, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json({ error: "بريدك مؤكد بالفعل" }, { status: 400 });
  }
  // the IP cap above doesn't stop the same account resending from many
  // networks — bound the account itself too
  if (isRateLimited(`verify-resend:u:${user.id}`, 5, 60 * 60_000)) {
    return NextResponse.json(
      { error: "أرسلنا رسائل تأكيد كثيرة — راجع بريدك (وصندوق الرسائل غير المرغوبة) أو انتظر قليلاً" },
      { status: 429 }
    );
  }
  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "إرسال البريد غير مفعّل حالياً" },
      { status: 503 }
    );
  }

  await issueEmailVerification(user.id, user.email);
  return NextResponse.json({ ok: true });
}
