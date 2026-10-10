import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/auth";
import {
  fetchProfile,
  googleConfigured,
  siteUrl,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  NONCE_COOKIE,
  OAUTH_OTP_COOKIE,
  cookieValue,
  oauthCookieOptions,
} from "@/lib/google-oauth";
import { rateLimitGuard } from "@/lib/rate-limit";
import { emailConfigured } from "@/lib/email";
import { startOtpChallenge } from "@/lib/login-otp";
import { safeEqual } from "@/lib/crypto";
import { resolveGoogleUser } from "@/lib/google-account";

function fail(reason: string) {
  return clearFlow(NextResponse.redirect(new URL(`/login?error=${reason}`, siteUrl())));
}
function clearFlow(res: NextResponse) {
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NONCE_COOKIE]) res.cookies.delete(name);
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

/** Google sends the visitor back here with a one-time code. */
export async function GET(req: Request) {
  const limited = await rateLimitGuard(req, "google-callback", 20, 10 * 60_000);
  if (limited) return limited;
  if (!googleConfigured()) return fail("google");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = cookieValue(req, STATE_COOKIE);
  const verifier = cookieValue(req, VERIFIER_COOKIE),
    nonce = cookieValue(req, NONCE_COOKIE);

  // the user declined at the consent screen, or the state doesn't match ours
  if (!code || !state || !cookieState || !verifier || !nonce || !safeEqual(state, cookieState)) {
    return fail("google");
  }

  const profile = await fetchProfile(code, verifier, nonce);
  if (!profile) return fail("google");
  const account = await resolveGoogleUser(profile);
  if (!account.ok) return fail(account.reason);
  const user = account.user;

  // Respect the user's email 2FA preference for every provider. The opaque
  // challenge is harmless without the separately emailed six-digit code.
  if (user.twoFactorEmail) {
    if (!emailConfigured()) return fail("two_factor_unavailable");
    const otp = await startOtpChallenge(user);
    if (!otp.ok) return fail("two_factor_unavailable");
    const next = new URL("/login", siteUrl());
    const res = NextResponse.redirect(next);
    res.cookies.set(OAUTH_OTP_COOKIE, otp.challenge, oauthCookieOptions);
    return clearFlow(res);
  }

  const token = await signSessionToken(
    {
      sub: user.id,
      role: user.role,
      name: user.name,
    },
    user.sessionVersion,
  );

  const res = NextResponse.redirect(new URL("/dashboard", siteUrl()));
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  res.cookies.delete(OAUTH_OTP_COOKIE);
  return clearFlow(res);
}
