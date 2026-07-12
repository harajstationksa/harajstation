import { db } from "./db";
import { LIMITS } from "./constants";

/**
 * Flip expired time-limited PRO memberships (free-tier promo) back to FREE.
 * proUntil = NULL means permanent PRO and is never touched.
 */
export async function expireProMemberships() {
  await db.user.updateMany({
    where: { isPro: true, proUntil: { lte: new Date() } },
    data: { isPro: false, proUntil: null },
  });
}

/** Account limits come from the admin-editable Plan table, with safe fallbacks. */
export async function getPlanLimits(isPro: boolean) {
  const plan = await db.plan.findUnique({
    where: { key: isPro ? "PRO_MONTHLY" : "FREE" },
  });
  return {
    maxListings:
      plan?.maxListings ?? (isPro ? 100000 : LIMITS.FREE_LISTINGS),
    maxAuctions:
      plan?.maxAuctions ?? (isPro ? LIMITS.PRO_AUCTIONS : LIMITS.FREE_AUCTIONS),
    maxStores: plan?.maxStores ?? (isPro ? 5 : 1),
    dailyPoints: plan?.dailyPoints ?? (isPro ? 25 : 5),
  };
}
