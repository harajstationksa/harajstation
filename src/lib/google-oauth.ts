import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { safeEqual } from "./crypto";

export const STATE_COOKIE = "g_oauth_state";
export const VERIFIER_COOKIE = "g_oauth_verifier";
export const NONCE_COOKIE = "g_oauth_nonce";
export const OAUTH_OTP_COOKIE = "g_oauth_otp";
export const oauthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 300,
};
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), {
  timeoutDuration: 8000,
});
export function googleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}
export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
export function redirectUri() {
  return `${siteUrl()}/api/auth/social/google/callback`;
}
export function newState() {
  return randomBytes(32).toString("hex");
}
export function newVerifier() {
  return randomBytes(32).toString("base64url");
}
export function cookieValue(req: Request, name: string) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export function consentUrl(state: string, verifier: string, nonce: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
};
export async function fetchProfile(
  code: string,
  verifier: string,
  nonce: string,
): Promise<GoogleProfile | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
      body: new URLSearchParams({
        code,
        code_verifier: verifier,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    if (!response.ok) return null;
    const tokens = (await response.json()) as { id_token?: string };
    if (!tokens.id_token) return null;
    const { payload } = await jwtVerify(tokens.id_token, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_CLIENT_ID!,
      algorithms: ["RS256"],
      maxTokenAge: "10m",
      clockTolerance: 10,
    });
    if (
      typeof payload.nonce !== "string" ||
      !safeEqual(payload.nonce, nonce) ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string"
    )
      return null;
    if (payload.azp && payload.azp !== process.env.GOOGLE_CLIENT_ID) return null;
    let picture: string | undefined;
    if (typeof payload.picture === "string") {
      const url = new URL(payload.picture);
      if (
        url.protocol === "https:" &&
        (url.hostname === "googleusercontent.com" ||
          url.hostname.endsWith(".googleusercontent.com"))
      )
        picture = url.href;
    }
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase().trim(),
      emailVerified: payload.email_verified === true,
      name:
        typeof payload.name === "string" && payload.name.trim()
          ? payload.name.trim()
          : payload.email.split("@")[0],
      picture,
    };
  } catch {
    return null;
  }
}
