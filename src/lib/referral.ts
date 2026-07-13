import { db } from "./db";
import { adjustPoints } from "./points";
import { notify } from "./notify";
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

/**
 * Credit the referrer their commission for a completed points purchase by
 * `buyerId`. No-op when the program is off, the buyer has no referrer, or the
 * commission rounds to zero. Never throws — a referral hiccup must not break
 * the payment flow.
 */
export async function awardReferralBonus(
  buyerId: string,
  purchasedPoints: number,
  paymentId?: string
): Promise<void> {
  try {
    const { enabled, percent } = await getReferralConfig();
    if (!enabled || percent <= 0 || purchasedPoints <= 0) return;

    const buyer = await db.user.findUnique({
      where: { id: buyerId },
      select: { name: true, referredById: true },
    });
    if (!buyer?.referredById || buyer.referredById === buyerId) return;

    const reward = Math.floor((purchasedPoints * percent) / 100);
    if (reward < 1) return;

    await adjustPoints(
      buyer.referredById,
      reward,
      `مكافأة إحالة ${percent}% — شحن ${buyer.name} ${purchasedPoints.toLocaleString("en-US")} نقطة`
    );
    await db.referralEarning.create({
      data: {
        referrerId: buyer.referredById,
        referredId: buyerId,
        paymentId: paymentId ?? null,
        points: reward,
      },
    });
    await notify(
      buyer.referredById,
      "SYSTEM",
      "مكافأة إحالة 🎁",
      `حصلت على ${reward.toLocaleString("en-US")} نقطة لأن ${buyer.name} شحن رصيده عبر كود إحالتك`,
      "/dashboard/referrals"
    );
  } catch (e) {
    console.error("referral bonus failed:", e);
  }
}
