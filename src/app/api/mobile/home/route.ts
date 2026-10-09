import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listingCardInclude, serializeListingCard } from "../_lib/serialize";
import { safeBannerEmbedUrl } from "@/lib/banner-embed";
import { getSponsored } from "@/lib/campaigns";
import { getSetting } from "@/lib/settings";
import { bannerOrder, visibleBannerWhere } from "@/lib/visible-banners";

/** Home feed: banners + featured + live auctions + latest listings. */
export async function GET() {
  const now = new Date();
  const [banners, featured, auctions, latest, promoted, categories, statsVisible] =
    await Promise.all([
      db.banner.findMany({
        where: visibleBannerWhere(now),
        orderBy: bannerOrder,
        select: {
          id: true,
          title: true,
          imageUrl: true,
          mobileImageUrl: true,
          linkUrl: true,
          position: true,
          embedHtml: true,
        },
      }),
      db.listing.findMany({
        where: {
          seller: { isBanned: false },
          status: "ACTIVE",
          isFeatured: true,
          OR: [{ featuredUntil: null }, { featuredUntil: { gt: now } }],
        },
        orderBy: { bumpedAt: "desc" },
        take: 10,
        include: listingCardInclude,
      }),
      db.listing.findMany({
        where: {
          seller: { isBanned: false },
          status: "ACTIVE",
          type: "AUCTION",
          auction: { status: "LIVE", endsAt: { gt: now } },
        },
        orderBy: { auction: { endsAt: "asc" } },
        take: 10,
        include: listingCardInclude,
      }),
      db.listing.findMany({
        where: { seller: { isBanned: false }, status: "ACTIVE", type: { not: "AUCTION" } },
        orderBy: { bumpedAt: "desc" },
        take: 20,
        include: listingCardInclude,
      }),
      db.listing.findMany({
        where: { seller: { isBanned: false }, status: "ACTIVE", isPromoted: true },
        orderBy: { bumpedAt: "desc" },
        take: 8,
        include: listingCardInclude,
      }),
      db.category.findMany({
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        include: { children: { select: { id: true } } },
      }),
      getSetting("HOME_STATS_VISIBLE"),
    ]);

  const grouped = await db.listing.groupBy({
    by: ["categoryId"],
    where: { status: "ACTIVE", seller: { isBanned: false } },
    _count: true,
  });
  const counts = new Map(grouped.map((g) => [g.categoryId, g._count]));
  const sections = await Promise.all(
    categories
      .filter((cat) =>
        [cat.id, ...cat.children.map((child) => child.id)].some((id) => (counts.get(id) ?? 0) > 0),
      )
      .map(async (cat) => {
        const categoryIds = [cat.id, ...cat.children.map((child) => child.id)];
        const [pinned, regular] = await Promise.all([
          getSponsored({ categoryIds, take: 4 }),
          db.listing.findMany({
            where: {
              status: "ACTIVE",
              seller: { isBanned: false },
              isPromoted: false,
              categoryId: { in: categoryIds },
            },
            orderBy: { bumpedAt: "desc" },
            take: 8,
            include: listingCardInclude,
          }),
        ]);
        const pinnedCards = pinned.length
          ? await db.listing.findMany({
              where: {
                id: { in: pinned.map((ad) => ad.id) },
                status: "ACTIVE",
                seller: { isBanned: false },
              },
              include: listingCardInclude,
            })
          : [];
        const byId = new Map(pinnedCards.map((ad) => [ad.id, ad]));
        const orderedPinned = pinned.flatMap((ad) => (byId.has(ad.id) ? [byId.get(ad.id)!] : []));
        return {
          slug: cat.slug,
          nameAr: cat.nameAr,
          items: [...orderedPinned, ...regular.slice(0, 8 - orderedPinned.length)].map(
            serializeListingCard,
          ),
        };
      }),
  );
  let stats = null;
  if (statsVisible === "1") {
    const [activeListings, liveAuctions, users] = await Promise.all([
      db.listing.count({ where: { status: "ACTIVE", seller: { isBanned: false } } }),
      db.auction.count({ where: { status: "LIVE", endsAt: { gt: now } } }),
      db.user.count(),
    ]);
    stats = { activeListings, liveAuctions, users };
  }

  return NextResponse.json(
    {
      banners: banners.map(({ embedHtml, ...banner }) => ({
        ...banner,
        embedUrl: safeBannerEmbedUrl(embedHtml),
      })),
      featured: featured.map(serializeListingCard),
      auctions: auctions.map(serializeListingCard),
      latest: latest.map(serializeListingCard),
      promoted: promoted.map(serializeListingCard),
      categorySections: sections,
      stats,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
