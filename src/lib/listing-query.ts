import type { Prisma } from "@prisma/client";
import { normalizeArabic } from "./arabic";
import { expandQuery } from "./search-smart";

export type SP = Record<string, string | string[] | undefined>;

export const str = (v: string | string[] | undefined) =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export function buildListingWhere(sp: SP): Prisma.ListingWhereInput {
  const q = str(sp.q);
  const min = Number(str(sp.min)) || undefined;
  const max = Number(str(sp.max)) || undefined;
  const category = str(sp.category);
  // smart search: each term expands to its synonym group ("ايفون" ⇄ "iphone"),
  // every group must match somewhere in the normalized index or title
  const groups = q ? expandQuery(q) : [];

  // several filters below need their own OR — collecting them in one AND list
  // keeps them from clobbering each other on the same object key
  const and: Prisma.ListingWhereInput[] = [];
  if (groups.length > 0) {
    and.push(
      ...groups.map((group) => ({
        OR: group.flatMap((t) => [
          { searchText: { contains: t } },
          // titles are raw user text — "IPhone 15" must match "iphone"
          { title: { contains: t, mode: "insensitive" as const } },
        ]),
      }))
    );
  }
  // An auction has no `price` — its money lives on the auction row. Comparing
  // a NULL column against a range excludes the row, so a plain price filter
  // used to make every auction vanish from the results. Match either side.
  if (min || max) {
    and.push({
      OR: [
        { price: { gte: min, lte: max } },
        { auction: { startPrice: { gte: min, lte: max } } },
      ],
    });
  }
  // «بائع موثّق»: identity-verified seller or a verified store
  if (str(sp.verified)) {
    and.push({
      OR: [{ seller: { idVerified: true } }, { store: { isVerified: true } }],
    });
  }

  return {
    status: "ACTIVE",
    ...(groups.length === 0 && q
      ? { searchText: { contains: normalizeArabic(q) } }
      : {}),
    ...(str(sp.city) ? { city: str(sp.city) } : {}),
    ...(str(sp.condition) ? { condition: str(sp.condition) } : {}),
    ...(str(sp.type) ? { type: str(sp.type) } : {}),
    ...(str(sp.featured) ? { isFeatured: true } : {}),
    ...(category
      ? {
          category: {
            OR: [{ slug: category }, { parent: { slug: category } }],
          },
        }
      : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

export function listingOrderBy(
  sort: string | undefined
): Prisma.ListingOrderByWithRelationInput {
  switch (sort) {
    // priceless rows (auctions, «على السوم» announcements) sort to the end
    // either way — descending would otherwise lead with a wall of NULLs
    case "price_asc":
      return { price: { sort: "asc", nulls: "last" } };
    case "price_desc":
      return { price: { sort: "desc", nulls: "last" } };
    case "views":
      return { views: "desc" };
    default:
      // bumpedAt = createdAt until the seller renews («تجديد») the listing —
      // renewing is what lifts it back to the top of «الأحدث»
      return { bumpedAt: "desc" };
  }
}

/**
 * Relevance score for search results. Ordering: relevance → promotion
 * (featured) → same-city → recency.
 */
export function scoreListing(
  listing: {
    title: string;
    searchText: string;
    isFeatured: boolean;
    isPromoted?: boolean;
    city: string;
    createdAt: Date;
  },
  q: string,
  userCity?: string
): number {
  const groups = expandQuery(q);
  const title = normalizeArabic(listing.title);
  let score = 0;
  for (const group of groups) {
    if (group.some((t) => title.includes(t))) score += 5;
    else if (group.some((t) => listing.searchText.includes(t))) score += 2;
  }
  if (listing.isPromoted) score += 4; // paid campaign boost
  if (listing.isFeatured) score += 3;
  if (userCity && listing.city === userCity) score += 1;
  // recency: up to +2 for listings under a week old
  const ageDays = (Date.now() - listing.createdAt.getTime()) / 86_400_000;
  score += Math.max(0, 2 - ageDays / 3.5);
  return score;
}
