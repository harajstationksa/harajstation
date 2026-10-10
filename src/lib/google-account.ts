import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "./db";
import { isValidDisplayName } from "./utils";
import { getFreeTierConfig } from "./settings";
import { generateReferralCode } from "./referral";
import { STAFF_ROLES } from "./constants";
import type { GoogleProfile } from "./google-oauth";

const AVATAR_COLORS = ["#db7759", "#0ea5e9", "#8b5cf6", "#10b981", "#ec4899"];

export type GoogleAccountResult =
  | { ok: true; user: User }
  | { ok: false; reason: "google_unverified" | "google_link_required" | "staff" | "banned" };

/**
 * Find or create the account behind a verified Google profile. Shared by the
 * web redirect flow and native app sign-in so both apply the same rules:
 * the provider subject is the identity, and an email alone never silently
 * takes over an existing, unverified password account.
 */
export async function resolveGoogleUser(profile: GoogleProfile): Promise<GoogleAccountResult> {
  if (!profile.emailVerified) return { ok: false, reason: "google_unverified" };

  let user = await db.user.findUnique({ where: { googleSub: profile.sub } });

  if (!user) {
    const emailOwner = await db.user.findUnique({ where: { email: profile.email } });
    if (emailOwner) {
      if (STAFF_ROLES.includes(emailOwner.role)) return { ok: false, reason: "staff" };
      const legacyGoogleAccount = emailOwner.passwordHash.startsWith("oauth:google:");
      if (!emailOwner.emailVerifiedAt && !legacyGoogleAccount)
        return { ok: false, reason: "google_link_required" };
      user = await db.user.update({
        where: { id: emailOwner.id },
        data: {
          googleSub: profile.sub,
          ...(legacyGoogleAccount && !emailOwner.emailVerifiedAt
            ? { emailVerifiedAt: new Date() }
            : {}),
        },
      });
    }
  }

  if (!user) {
    // same launch promo as email signup: free PRO for N days while the switch is on
    const freeTier = await getFreeTierConfig();
    const proGrant = freeTier.enabled
      ? { isPro: true, proUntil: new Date(Date.now() + freeTier.days * 24 * 60 * 60 * 1000) }
      : {};
    // Google names are free text; keep the same display-name rule as signup
    const name = isValidDisplayName(profile.name)
      ? profile.name.slice(0, 60)
      : profile.email.split("@")[0].slice(0, 60) || "مستخدم";
    user = await db.user.create({
      data: {
        name,
        email: profile.email,
        googleSub: profile.sub,
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
  }

  if (user.isBanned) return { ok: false, reason: "banned" };
  if (STAFF_ROLES.includes(user.role)) return { ok: false, reason: "staff" };
  return { ok: true, user };
}
