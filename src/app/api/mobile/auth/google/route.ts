import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/auth";
import { googleMobileConfigured, verifyMobileIdToken } from "@/lib/google-oauth";
import { resolveGoogleUser } from "@/lib/google-account";
import { rateLimitGuard } from "@/lib/rate-limit";
import { emailConfigured } from "@/lib/email";
import { maskEmail, startOtpChallenge } from "@/lib/login-otp";

const schema = z.object({ idToken: z.string().min(20).max(8192) });

const REASONS: Record<string, string> = {
  google_unverified: "بريد Google غير موثّق",
  google_link_required:
    "هذا البريد مسجّل بكلمة مرور ولم يُفعَّل بعد — سجّل الدخول بكلمة المرور وفعّل بريدك أولاً",
  staff: "حسابات الموظفين تدخل من بوابة الإدارة",
  banned: "هذا الحساب موقوف",
};

/**
 * Native «الدخول بحساب Google». Same answers as /api/auth/login so the app
 * reuses one flow: `{ok:true}` + session cookie, or `{requiresOtp, challenge}`
 * when the account has email 2FA on.
 */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "google-mobile", 20, 10 * 60_000);
  if (limited) return limited;
  if (!googleMobileConfigured())
    return NextResponse.json(
      { error: apiMessage(req, "الدخول بحساب Google غير متاح حالياً") },
      { status: 503 },
    );
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: apiMessage(req, "طلب غير صالح") }, { status: 400 });

  const profile = await verifyMobileIdToken(parsed.data.idToken);
  if (!profile)
    return NextResponse.json(
      { error: apiMessage(req, "تعذّر التحقق من حساب Google — حاول مجدداً") },
      { status: 401 },
    );

  const account = await resolveGoogleUser(profile);
  if (!account.ok)
    return NextResponse.json({ error: apiMessage(req, REASONS[account.reason]) }, { status: 403 });
  const user = account.user;

  if (user.twoFactorEmail) {
    if (!emailConfigured())
      return NextResponse.json(
        { error: apiMessage(req, "التحقق بخطوتين غير متاح حالياً") },
        { status: 503 },
      );
    const otp = await startOtpChallenge(user);
    if (!otp.ok) return NextResponse.json({ error: apiMessage(req, otp.error) }, { status: 429 });
    return NextResponse.json({
      requiresOtp: true,
      challenge: otp.challenge,
      email: maskEmail(user.email),
    });
  }

  const token = await signSessionToken(
    { sub: user.id, role: user.role, name: user.name },
    user.sessionVersion,
  );
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
