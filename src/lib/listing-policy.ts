import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { adjustPointsWithClient } from "./points";
import { getPlanLimits } from "./limits";
import { getSettingInt } from "./settings";
import { addReviewReason, classifyListing } from "./smart-review";
import { findBannedWord } from "./moderation";

export const PUBLIC_LISTING_STATUSES = ["ACTIVE", "SOLD", "EXPIRED"];
export const publicListingWhere = {
  status: { in: PUBLIC_LISTING_STATUSES },
  seller: { isBanned: false },
} satisfies Prisma.ListingWhereInput;
export function isPublicListing(listing: { status: string; seller?: { isBanned: boolean } }) {
  return PUBLIC_LISTING_STATUSES.includes(listing.status) && !listing.seller?.isBanned;
}
export async function lockListing(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${id} FOR UPDATE`;
}
export async function lockPublishingQuota(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`publishing:${userId}`}, 0))`;
}
export async function hasListingCapacity(
  tx: Prisma.TransactionClient,
  userId: string,
  isPro: boolean,
  auction: boolean,
) {
  const limits = await getPlanLimits(isPro);
  const count = await tx.listing.count({
    where: {
      sellerId: userId,
      status: { in: ["ACTIVE", "PENDING", "AWAITING_INFO"] },
      type: auction ? "AUCTION" : { not: "AUCTION" },
    },
  });
  return count < (auction ? limits.maxAuctions : limits.maxListings);
}

export async function featureListing(id: string, userId: string) {
  const cost = await getSettingInt("FEATURE_POINT_COST", 100);
  return db.$transaction(async (tx) => {
    await lockListing(tx, id);
    const listing = await tx.listing.findUnique({ where: { id } });
    if (
      !listing ||
      listing.sellerId !== userId ||
      listing.status !== "ACTIVE" ||
      (listing.isFeatured && (!listing.featuredUntil || listing.featuredUntil > new Date()))
    )
      return false;
    if (
      cost > 0 &&
      (await adjustPointsWithClient(tx, userId, -cost, "تمييز إعلان (7 أيام)")) === null
    )
      return false;
    await tx.listing.update({
      where: { id },
      data: { isFeatured: true, featuredUntil: new Date(Date.now() + 7 * 86400000) },
    });
    return true;
  });
}
export async function bumpListing(id: string, userId: string) {
  const [hours, cost] = await Promise.all([
    getSettingInt("BUMP_FREE_HOURS", 48),
    getSettingInt("BUMP_POINT_COST", 15),
  ]);
  return db.$transaction(async (tx) => {
    await lockListing(tx, id);
    const listing = await tx.listing.findUnique({ where: { id } });
    if (!listing || listing.sellerId !== userId || listing.status !== "ACTIVE") return false;
    // Coalesce retries/double taps; subsequent intentional renewals remain possible.
    if (Date.now() - listing.bumpedAt.getTime() < 60000) return false;
    if (
      Date.now() < listing.bumpedAt.getTime() + hours * 3600000 &&
      cost > 0 &&
      (await adjustPointsWithClient(tx, userId, -cost, "تجديد إعلان قبل الموعد المجاني")) === null
    )
      return false;
    await tx.listing.update({ where: { id }, data: { bumpedAt: new Date() } });
    return true;
  });
}
export async function relistListing(id: string, user: { id: string; isPro: boolean }) {
  return db.$transaction(async (tx) => {
    await lockPublishingQuota(tx, user.id);
    await lockListing(tx, id);
    const listing = await tx.listing.findUnique({
      where: { id },
      include: { category: { include: { parent: true } } },
    });
    if (
      !listing ||
      listing.sellerId !== user.id ||
      listing.type === "AUCTION" ||
      !["SOLD", "EXPIRED"].includes(listing.status)
    )
      return false;
    if (!(await hasListingCapacity(tx, user.id, user.isPro, false))) return false;
    let attributes: Record<string, string> = {};
    try {
      attributes = JSON.parse(listing.attributes);
    } catch {}
    let review = classifyListing({
      title: listing.title,
      description: listing.description,
      categorySlug: listing.category.slug,
      parentSlug: listing.category.parent?.slug,
      categoryName: listing.category.nameAr,
      attributes,
    });
    if (
      await findBannedWord(
        `${listing.title} ${listing.description} ${Object.values(attributes).join(" ")}`,
      )
    )
      review = addReviewReason(review, "PROHIBITED", "BANNED_WORD", "قائمة محظورات الإدارة");
    await tx.listing.update({
      where: { id },
      data: {
        status: review.level === "NORMAL" ? "ACTIVE" : "PENDING",
        riskLevel: review.level,
        riskReasons: JSON.stringify(review.reasons),
        riskSignals: JSON.stringify(review.signals),
        reviewedAt: null,
        reviewedBy: null,
        createdAt: new Date(),
        bumpedAt: new Date(),
      },
    });
    return true;
  });
}
/** Retain commitments and conversation history; deletion only hides eligible ads. */
export async function removeOwnListing(id: string, userId: string) {
  return db.$transaction(async (tx) => {
    await lockListing(tx, id);
    const listing = await tx.listing.findUnique({
      where: { id },
      include: {
        auction: { include: { _count: { select: { bids: true, proxies: true } } } },
        _count: { select: { transactions: true } },
      },
    });
    if (
      !listing ||
      listing.sellerId !== userId ||
      listing._count.transactions > 0 ||
      (listing.auction && (listing.auction._count.bids > 0 || listing.auction._count.proxies > 0))
    )
      return false;
    await tx.auction.updateMany({
      where: { listingId: id, status: { in: ["LIVE", "PENDING"] } },
      data: { status: "CANCELLED", reviewRemainingMs: null },
    });
    await tx.campaign.updateMany({
      where: { listingId: id, status: { in: ["ACTIVE", "PAUSED_REVIEW"] } },
      data: { status: "CANCELLED", endedAt: new Date(), reviewPausedAt: null },
    });
    await tx.listing.update({
      where: { id },
      data: { status: "REMOVED", isFeatured: false, isPromoted: false },
    });
    return true;
  });
}
export async function expireFeaturedListings() {
  return db.listing.updateMany({
    where: { isFeatured: true, featuredUntil: { lte: new Date() } },
    data: { isFeatured: false },
  });
}
