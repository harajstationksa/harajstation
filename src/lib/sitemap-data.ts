import { db } from "./db";
import { SITE } from "./seo";
export const SITEMAP_SIZE = 1000;
export const sitemapListingWhere = {
  status: "ACTIVE",
  seller: { isBanned: false },
  OR: [{ type: { not: "AUCTION" } }, { auction: { isNot: null } }],
};
export function xmlEscape(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}
export async function sitemapParts() {
  const [listings, stores, categories] = await Promise.all([
    db.listing.count({ where: sitemapListingWhere }),
    db.store.count({ where: { user: { isBanned: false } } }),
    db.category.count(),
  ]);
  return [
    "static",
    ...Object.entries({ listings, stores, categories }).flatMap(([kind, count]) =>
      Array.from({ length: Math.ceil(count / SITEMAP_SIZE) }, (_, i) => `${kind}-${i}`),
    ),
  ];
}
export async function sitemapRows(part: string): Promise<Array<{ url: string; updated?: Date }>> {
  if (part === "static")
    return [
      "",
      "/listings",
      "/auctions",
      "/categories",
      "/trust",
      "/pro",
      "/contact",
      "/terms",
      "/privacy",
    ].map((p) => ({ url: SITE + p }));
  const match = /^(listings|stores|categories)-(\d{1,6})$/.exec(part);
  if (!match) return [];
  const skip = Number(match[2]) * SITEMAP_SIZE;
  if (match[1] === "listings")
    return (
      await db.listing.findMany({
        where: sitemapListingWhere,
        orderBy: { id: "asc" },
        skip,
        take: SITEMAP_SIZE,
        select: { id: true, updatedAt: true, auction: { select: { id: true } } },
      })
    ).map((l) => ({
      url: `${SITE}/${l.auction ? `auctions/${l.auction.id}` : `listings/${l.id}`}`,
      updated: l.updatedAt,
    }));
  if (match[1] === "stores")
    return (
      await db.store.findMany({
        where: { user: { isBanned: false } },
        orderBy: { id: "asc" },
        skip,
        take: SITEMAP_SIZE,
        select: { slug: true, updatedAt: true },
      })
    ).map((s) => ({ url: `${SITE}/store/${encodeURIComponent(s.slug)}`, updated: s.updatedAt }));
  return (
    await db.category.findMany({
      orderBy: { id: "asc" },
      skip,
      take: SITEMAP_SIZE,
      select: { slug: true },
    })
  ).map((c) => ({ url: `${SITE}/category/${encodeURIComponent(c.slug)}` }));
}
