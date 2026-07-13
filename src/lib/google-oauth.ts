/**
 * Google sign-in (OAuth 2.0 authorization-code flow).
 *
 * The app keeps its own identity — a `User` row plus the signed session cookie
 * in lib/auth. Google is only used to prove the person owns an email address;
 * the account is then matched (or created) by that verified address.
 */
import { randomBytes } from "node:crypto";

export const STATE_COOKIE = "g_oauth_state";

export function googleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

/**
 * Behind the nginx proxy, `req.url` carries the internal origin
 * (localhost:3000), so redirects must be built from the configured site URL —
 * which is also the only value we can trust, since a Host header is attacker
 * controlled.
 */
export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function redirectUri() {
  return `${siteUrl()}/api/auth/social/google/callback`;
}

export function newState() {
  return randomBytes(16).toString("hex");
}

/** Google's consent screen URL. */
export function consentUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export type GoogleProfile = {
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
};

/** Trade the one-time code for tokens, then read the profile behind them. */
export async function fetchProfile(code: string): Promise<GoogleProfile | null> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return null;

  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return null;

  // userinfo instead of decoding the id_token ourselves: it comes straight from
  // Google over TLS with our access token, so there is no signature to verify
  const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) return null;

  const info = (await infoRes.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!info.email) return null;

  return {
    email: info.email.toLowerCase().trim(),
    emailVerified: info.email_verified === true,
    name: info.name?.trim() || info.email.split("@")[0],
    picture: info.picture,
  };
}
