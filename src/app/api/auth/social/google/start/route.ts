import { NextResponse } from "next/server";
import {
  consentUrl,
  googleConfigured,
  newState,
  newVerifier,
  siteUrl,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  NONCE_COOKIE,
  oauthCookieOptions,
} from "@/lib/google-oauth";
import { rateLimitGuard } from "@/lib/rate-limit";

/** Send the visitor to Google's consent screen. */
export async function GET(req: Request) {
  const limited = await rateLimitGuard(req, "google-start", 10, 10 * 60_000);
  if (limited) return limited;

  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google", siteUrl()));
  }

  // random state, echoed back by Google and checked in the callback, so a
  // third party can't feed us an authorization code of their choosing
  const state = newState();
  const verifier = newVerifier(),
    nonce = newState();
  const res = NextResponse.redirect(consentUrl(state, verifier, nonce));
  res.cookies.set(STATE_COOKIE, state, oauthCookieOptions);
  res.cookies.set(VERIFIER_COOKIE, verifier, oauthCookieOptions);
  res.cookies.set(NONCE_COOKIE, nonce, oauthCookieOptions);
  return res;
}
