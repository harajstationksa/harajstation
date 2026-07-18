import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/auth";
import { fetchProfile, googleConfigured, siteUrl, STATE_COOKIE } from "@/lib/google-oauth";
import { rateLimitGuard } from "@/lib/rate-limit";
import { getFreeTierConfig } from "@/lib/settings";
import { generateReferralCode } from "@/lib/referral";

const AVATAR_COLORS = ["#db7759", "#0ea5e9", "#8b5cf6", "#10b981", "#ec4899"];

function fail(reason: string) {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, siteUrl()));
}

/** Google sends the visitor back here with a one-time code. */
export async function GET(req: Request) {
  const limited = await rateLimitGuard(req, "google-callback", 20, 10 * 60_000);
  if (limited) return limited;
  if (!googleConfigured()) return fail("google");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === STATE_COOKIE)?.[1];

  // the user declined at the consent screen, or the state doesn't match ours
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("google");
  }

  const profile = await fetchProfile(code);
  if (!profile) return fail("google");
  // Google says it owns this address — that claim is the whole point of the flow
  if (!profile.emailVerified) return fail("google_unverified");

  let user = await db.user.findUnique({ where: { email: profile.email } });

  if (!user) {
    // same launch promo as email signup: free PRO for N days while the switch is on
    const freeTier = await getFreeTierConfig();
    const proGrant = freeTier.enabled
      ? {
          isPro: true,
          proUntil: new Date(Date.now() + freeTier.days * 24 * 60 * 60 * 1000),
        }
      : {};

    user = await db.user.create({
      data: {
        name: profile.name,
        email: profile.email,
        city: "الرياض", // editable from settings — Google doesn't tell us
        // unusable hash: a social account can only ever sign in through Google
        passwordHash: `oauth:google:${randomUUID()}`,
        avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        avatarUrl: profile.picture ?? null,
        emailVerifiedAt: new Date(),
        referralCode: await generateReferralCode(),
        ...proGrant,
      },
    });
  } else if (!user.emailVerifiedAt) {
    // they signed up with a password first; Google just verified the address
    user = await db.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
  }

  if (user.isBanned) return fail("banned");

  const token = await signSessionToken({
    sub: user.id,
    role: user.role,
    name: user.name,
  });

  const res = NextResponse.redirect(new URL("/dashboard", siteUrl()));
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
