import type { Category, Listing } from "@prisma/client";
import { db } from "./db";
import { notify, notifyMany } from "./notify";
import { expandQuery } from "./search-smart";
import { formatSAR } from "./utils";

/**
 * Saved-search alerts + seller-follow alerts.
 * Called right after a listing is published: every user whose saved search
 * matches the new listing — and every follower of the seller — gets an
 * in-app notification mirrored to Web Push.
 */

type NewListing = Listing & { category: Category & { parent: Category | null } };

/** Does this saved search match the listing? (query already smart-expanded) */
function matches(
  search: { query: string; category: string; city: string; type: string },
  listing: NewListing
): boolean {
  if (search.city && search.city !== listing.city) return false;
  if (search.type && search.type !== listing.type) return false;
  if (
    search.category &&
    search.category !== listing.category.slug &&
    search.category !== listing.category.parent?.slug
  ) {
    return false;
  }
  if (search.query) {
    const haystack = `${listing.searchText} ${listing.title}`;
    const groups = expandQuery(search.query);
    if (groups.length > 0) {
      // every term group must appear somewhere (synonyms count)
      return groups.every((group) => group.some((t) => haystack.includes(t)));
    }
  }
  return true;
}

/** Fan out alerts for a freshly published listing. Never throws. */
export async function alertSavedSearches(listingId: string): Promise<void> {
  try {
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      include: { category: { include: { parent: true } }, auction: true },
    });
    if (!listing || listing.status !== "ACTIVE") return;

    const href = listing.auction
      ? `/auctions/${listing.auction.id}`
      : `/listings/${listing.id}`;
    const isAuction = listing.type === "AUCTION";
    const priceText = isAuction
      ? listing.auction
        ? `يبدأ من ${formatSAR(listing.auction.startPrice)}`
        : ""
      : listing.price != null
        ? formatSAR(listing.price)
        : "على السوم";

    // ── saved searches ──
    const searches = await db.savedSearch.findMany({
      where: { userId: { not: listing.sellerId } },
    });
    const hitUserIds = new Set<string>();
    const hitSearchIds: string[] = [];
    for (const s of searches) {
      if (hitUserIds.has(s.userId)) continue;
      if (matches(s, listing)) {
        hitUserIds.add(s.userId);
        hitSearchIds.push(s.id);
      }
    }
    if (hitSearchIds.length > 0) {
      await db.savedSearch.updateMany({
        where: { id: { in: hitSearchIds } },
        data: { lastHitAt: new Date(), hits: { increment: 1 } },
      });
      await notifyMany(
        [...hitUserIds],
        "SYSTEM",
        isAuction ? "مزاد جديد يطابق بحثك المحفوظ" : "إعلان جديد يطابق بحثك المحفوظ",
        `"${listing.title}" في ${listing.city}${priceText ? ` · ${priceText}` : ""}`,
        href
      );
    }

    // ── seller followers ──
    const followers = await db.follow.findMany({
      where: { sellerId: listing.sellerId },
      select: { followerId: true },
    });
    if (followers.length > 0) {
      const seller = await db.user.findUnique({
        where: { id: listing.sellerId },
        select: { name: true },
      });
      await notifyMany(
        followers.map((f) => f.followerId),
        "SYSTEM",
        isAuction
          ? `مزاد جديد من ${seller?.name ?? "بائع تتابعه"}`
          : `إعلان جديد من ${seller?.name ?? "بائع تتابعه"}`,
        `"${listing.title}" في ${listing.city}${priceText ? ` · ${priceText}` : ""}`,
        href
      );
    }
  } catch {
    // alerts must never block publishing
  }
}

/** Notify a single user their saved search was created (confirmation UX). */
export async function confirmSavedSearch(userId: string, label: string) {
  await notify(
    userId,
    "SYSTEM",
    "تم حفظ بحثك",
    `سنرسل لك إشعاراً فور نزول إعلان يطابق «${label}».`,
    "/dashboard/searches"
  );
}
