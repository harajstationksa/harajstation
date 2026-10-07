import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookieValue, OAUTH_OTP_COOKIE } from "@/lib/google-oauth";
import { maskEmail } from "@/lib/login-otp";
import { rateLimitGuard } from "@/lib/rate-limit";
import { STAFF_ROLES } from "@/lib/constants";

export async function GET(req: Request) {
  const limited = await rateLimitGuard(req, "oauth-otp-context", 30, 60_000);
  if (limited) return limited;
  const challenge = cookieValue(req, OAUTH_OTP_COOKIE);
  const pending =
    challenge && /^[a-f0-9]{64}$/.test(challenge)
      ? await db.loginOtp.findUnique({ where: { challenge }, include: { user: true } })
      : null;
  const valid =
    pending &&
    pending.purpose === "SITE_LOGIN" &&
    !pending.consumedAt &&
    pending.deliveredAt &&
    pending.expiresAt > new Date() &&
    pending.attempts < 5 &&
    !pending.user.isBanned &&
    !STAFF_ROLES.includes(pending.user.role) &&
    pending.issuedEmail === pending.user.email &&
    pending.sessionVersion === pending.user.sessionVersion;
  const res = NextResponse.json(
    valid ? { requiresOtp: true, email: maskEmail(pending.user.email) } : { requiresOtp: false },
  );
  res.headers.set("Cache-Control", "private, no-store");
  if (!valid) res.cookies.delete(OAUTH_OTP_COOKIE);
  return res;
}
