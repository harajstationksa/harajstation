import { db } from "./db";
import { getSetting, getSettingInt } from "./settings";

/**
 * Referral program: every user carries a shareable code (HS-XXXXXX). New
 * signups that enter it are linked to the referrer forever, and the referrer
 * earns REFERRAL_PERCENT% (admin-tunable) of every points purchase the
 * invitee completes.
 */

// unambiguous alphabet — no 0/O/1/I/L
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `HS-${out}`;
}

/** New unique referral code (retries on the rare collision). */
export async function generateReferralCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const exists = await db.user.findUnique({ where: { referralCode: code } });
    if (!exists) return code;
  }
  // practically unreachable — fall back to a longer code
  return randomCode(10);
}

/** The user's referral code, minting one on first use (pre-feature accounts). */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return "";
  if (user.referralCode) return user.referralCode;
  const code = await generateReferralCode();
  await db.user.update({ where: { id: userId }, data: { referralCode: code } });
  return code;
}

export async function getReferralConfig(): Promise<{ enabled: boolean; percent: number }> {
  const [enabled, percent] = await Promise.all([
    getSetting("REFERRAL_ENABLED"),
    getSettingInt("REFERRAL_PERCENT", 10),
  ]);
  return {
    enabled: enabled === "1",
    percent: Math.min(100, Math.max(0, percent)),
  };
}
