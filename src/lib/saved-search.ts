import type { Category, Listing } from "@prisma/client";
import { db } from "./db";
import { notify, notifyMany } from "./notify";
import { expandQuery } from "./search-smart";

/**
 * Saved-search alerts + seller-follow alerts.
 * Processed by a durable job after a listing is published: every user whose saved search
 * matches the new listing — and every follower of the seller — gets an
 * in-app notification mirrored to Web Push.
 */

type NewListing = Listing & { category: Category & { parent: Category | null } };

/** Does this saved search match the listing? (query already smart-expanded) */
function matches(
  search: { query: string; category: string; city: string; type: string },
  listing: NewListing,
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

/** Fan out alerts; failures propagate so the durable worker can retry. */
export async function alertSavedSearches(listingId: string): Promise<void> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      category: { include: { parent: true } },
      auction: true,
      seller: { select: { isBanned: true, name: true } },
    },
  });
  if (!listing || listing.status !== "ACTIVE" || listing.seller.isBanned) return;
  const href = listing.auction ? `/auctions/${listing.auction.id}` : `/listings/${listing.id}`;
  const eventKey = `listing-alert:${listingId}`;
  const title = listing.type === "AUCTION" ? "مزاد جديد يهمك" : "إعلان جديد يهمك";
  const body = `"${listing.title}" في ${listing.city}`;
  let cursor: string | undefined;
  for (;;) {
    const searches = await db.savedSearch.findMany({
      where: { userId: { not: listing.sellerId }, user: { isBanned: false } },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!searches.length) break;
    const hits = searches.filter((s) => matches(s, listing));
    await db.$transaction(async (tx) => {
      const inserted = await tx.savedSearchMatch.createManyAndReturn({
        data: hits.map((s) => ({ searchId: s.id, listingId })),
        skipDuplicates: true,
        select: { searchId: true },
      });
      if (inserted.length)
        await tx.savedSearch.updateMany({
          where: { id: { in: inserted.map((m) => m.searchId) } },
          data: { hits: { increment: 1 }, lastHitAt: new Date() },
        });
    });
    await notifyMany(
      hits.map((s) => s.userId),
      "SYSTEM",
      title,
      body,
      href,
      eventKey,
    );
    cursor = searches[searches.length - 1].id;
  }
  cursor = undefined;
  for (;;) {
    const users: Array<{ id: string }> = await db.user.findMany({
      where: {
        id: { not: listing.sellerId },
        isBanned: false,
        OR: [
          { following: { some: { sellerId: listing.sellerId } } },
          ...(listing.storeId ? [{ storeFollows: { some: { storeId: listing.storeId } } }] : []),
        ],
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!users.length) break;
    await notifyMany(
      users.map((u) => u.id),
      "SYSTEM",
      title,
      body,
      href,
      eventKey,
    );
    cursor = users[users.length - 1].id;
  }
}

/** Notify a single user their saved search was created (confirmation UX). */
export async function confirmSavedSearch(userId: string, label: string) {
  await notify(
    userId,
    "SYSTEM",
    "تم حفظ بحثك",
    `سنرسل لك إشعاراً فور نزول إعلان يطابق «${label}».`,
    "/dashboard/searches",
  );
}
