import { db } from "./db";

/**
 * Smart audience targeting for a listing's promotion campaign.
 *
 * Signals used to score a candidate user's relevance to the listing —
 * every interaction signal is TIME-WEIGHTED (recent interest counts far
 * more than old interest):
 *   • contacted a seller about a listing in the same category family
 *     (opened a conversation) — the strongest purchase-intent signal
 *   • bid on auctions in the family — strong active intent
 *   • favorited listings in the family — saved-for-later intent
 *   • commented on listings in the family — engaged interest
 *   • same city as the listing (local buyers convert better)
 *   • recency of account activity — recently-active accounts are reachable
 *
 * Fairness/quality guards:
 *   • users already notified by ANY campaign in the last 24h are excluded
 *     (no notification fatigue — the reach is real, not spam)
 *   • owner, banned users, and staff are excluded
 *
 * Returns the top user ids to notify, best-match first.
 */

// recency multiplier: ×2 within 2 weeks, ×1 within 2 months, ×0.4 older
function recencyWeight(at: Date, now: number): number {
  const days = (now - at.getTime()) / 86_400_000;
  if (days <= 14) return 2;
  if (days <= 60) return 1;
  return 0.4;
}

export async function targetAudience(
  listing: { id: string; categoryId: string; city: string; sellerId: string },
  limit: number
): Promise<{ userId: string; score: number }[]> {
  const now = Date.now();

  // resolve the category family (this category + its parent's children)
  const category = await db.category.findUnique({
    where: { id: listing.categoryId },
    include: { parent: { include: { children: true } }, children: true },
  });
  const familyIds = new Set<string>([listing.categoryId]);
  if (category?.parentId) familyIds.add(category.parentId);
  category?.children.forEach((c) => familyIds.add(c.id));
  category?.parent?.children.forEach((c) => familyIds.add(c.id));
  const catFamily = [...familyIds];
  const inFamily = { listing: { categoryId: { in: catFamily } } } as const;

  // candidate signals within the category family (timestamped for weighting)
  const [convs, bids, favs, comments, recentlyNotified] = await Promise.all([
    db.conversation.findMany({
      where: inFamily,
      select: { buyerId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    db.bid.findMany({
      where: { auction: inFamily },
      select: { bidderId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    db.favorite.findMany({
      where: inFamily,
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    db.comment.findMany({
      where: inFamily,
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    // fatigue guard: campaign notifications sent in the last 24h
    db.notification.findMany({
      where: {
        type: "SYSTEM",
        title: "قد يهمّك هذا الإعلان",
        createdAt: { gt: new Date(now - 24 * 3600_000) },
      },
      select: { userId: true },
    }),
  ]);

  // aggregate time-weighted affinity score per user
  const score = new Map<string, number>();
  const bump = (uid: string, base: number, at: Date) =>
    score.set(uid, (score.get(uid) ?? 0) + base * recencyWeight(at, now));
  convs.forEach((c) => bump(c.buyerId, 6, c.createdAt)); // contacting a seller = purchase intent
  bids.forEach((b) => bump(b.bidderId, 5, b.createdAt)); // bidding = active intent
  favs.forEach((f) => bump(f.userId, 4, f.createdAt)); // saving = strong interest
  comments.forEach((c) => bump(c.userId, 3, c.createdAt)); // engaging = interest

  const fatigued = new Set(recentlyNotified.map((n) => n.userId));

  // fetch candidate users, filter out owner / banned / staff / fatigued
  const candidateIds = [...score.keys()].filter(
    (id) => id !== listing.sellerId && !fatigued.has(id)
  );
  const users = await db.user.findMany({
    where: { id: { in: candidateIds }, isBanned: false, role: "USER" },
    select: { id: true, city: true, lastDailyAt: true },
  });

  const ranked = users.map((u) => {
    let s = score.get(u.id) ?? 0;
    if (u.city === listing.city) s += 3; // local boost
    // account recency: up to +4 for active within the last week
    if (u.lastDailyAt) {
      const days = (now - u.lastDailyAt.getTime()) / 86_400_000;
      s += Math.max(0, 4 - days / 2);
    }
    return { userId: u.id, score: s };
  });

  ranked.sort((a, b) => b.score - a.score);

  // top up with recently-active users if the affinity pool is too small
  if (ranked.length < limit) {
    const have = new Set(ranked.map((r) => r.userId));
    const fillers = await db.user.findMany({
      where: {
        isBanned: false,
        role: "USER",
        id: { notIn: [listing.sellerId, ...have, ...fatigued] },
      },
      orderBy: { lastDailyAt: "desc" },
      take: limit - ranked.length,
      select: { id: true, city: true },
    });
    fillers.forEach((f) =>
      ranked.push({ userId: f.id, score: f.city === listing.city ? 1 : 0.5 })
    );
  }

  return ranked.slice(0, limit);
}
