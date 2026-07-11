import { headers } from "next/headers";
import { db } from "./db";
import { notify } from "./notify";
import { subnetKey } from "./visitor";
import { cardInclude } from "./types";

/**
 * Expire day-based campaigns whose time is up: mark COMPLETED, un-promote the
 * listing, and notify the owner. Called lazily from high-traffic pages (same
 * pattern as finalizeExpiredAuctions).
 */
export async function finalizeExpiredCampaigns(): Promise<void> {
  const now = new Date();
  const expired = await db.campaign.findMany({
    where: { status: "ACTIVE", endsAt: { not: null, lt: now } },
    include: { listing: { select: { title: true } } },
  });
  for (const c of expired) {
    await db.$transaction([
      db.campaign.update({
        where: { id: c.id },
        data: { status: "COMPLETED", endedAt: now },
      }),
      db.listing.update({
        where: { id: c.listingId },
        data: { isPromoted: false, promotedUntil: null },
      }),
    ]);
    await notify(
      c.ownerId,
      "SYSTEM",
      "انتهت حملتك الإعلانية",
      `انتهت مدة حملة "${c.listing.title}" (${c.days} ${c.days === 1 ? "يوم" : "أيام"}). راجع النتائج في لوحة الحملات.`,
      "/dashboard/campaigns"
    );
  }
}

/**
 * Fisher–Yates shuffle — a fresh random order on every request, so rotation
 * among sponsored listings in the same category is fair: each refresh
 * reshuffles and no funded ad is systematically favored.
 */
export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Order a result set for a category surface: sponsored (isPromoted) listings
 * first in a random rotation, the rest in their original order.
 */
export function sponsoredFirst<T extends { isPromoted: boolean }>(items: T[]): {
  sponsored: T[];
  rest: T[];
} {
  return {
    sponsored: shuffle(items.filter((l) => l.isPromoted)),
    rest: items.filter((l) => !l.isPromoted),
  };
}

/** cardInclude + the listing's active campaign id (for impression/click logging) */
export const sponsoredInclude = {
  ...cardInclude,
  campaigns: {
    where: { status: "ACTIVE" as const },
    select: { id: true, targetCity: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
};

export type SponsoredListing = NonNullable<
  Awaited<ReturnType<typeof getSponsored>>
>[number];

/**
 * Fetch sponsored listings for a surface, targeted to the surface's context:
 *   • categoryIds — only campaigns whose listing sits in these categories
 *     (a phone campaign shows on phone surfaces, never on real-estate ones)
 *   • city       — geo-targeted campaigns only surface in their target city
 *     (campaigns without a target city show everywhere)
 * Rotation is a fresh shuffle per request so every funded ad gets fair play.
 */
export async function getSponsored(opts: {
  categoryIds?: string[];
  city?: string;
  take: number;
}) {
  const rows = await db.listing.findMany({
    where: {
      status: "ACTIVE",
      isPromoted: true,
      ...(opts.categoryIds?.length ? { categoryId: { in: opts.categoryIds } } : {}),
    },
    include: sponsoredInclude,
    take: 40,
  });
  const geoOk = rows.filter((l) => {
    const target = l.campaigns[0]?.targetCity ?? "";
    return !target || !opts.city || target === opts.city;
  });
  return shuffle(geoOk).slice(0, opts.take);
}

/**
 * Count ONE impression per campaign per visitor network (IP /24) — reloading
 * the page never inflates the advertiser's numbers. Safe to call from any
 * server component; failures never block rendering.
 */
export async function recordImpressions(campaignIds: string[]): Promise<void> {
  const unique = [...new Set(campaignIds.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    const visitorKey = subnetKey(await headers());
    const seen = await db.campaignImpression.findMany({
      where: { visitorKey, campaignId: { in: unique } },
      select: { campaignId: true },
    });
    const seenIds = new Set(seen.map((s) => s.campaignId));
    const fresh = unique.filter((id) => !seenIds.has(id));
    for (const campaignId of fresh) {
      try {
        await db.campaignImpression.create({ data: { campaignId, visitorKey } });
        await db.campaign.update({
          where: { id: campaignId },
          data: { impressions: { increment: 1 } },
        });
      } catch {
        // unique-constraint race: another request already counted this visitor
      }
    }
  } catch {
    // analytics must never break the page
  }
}
