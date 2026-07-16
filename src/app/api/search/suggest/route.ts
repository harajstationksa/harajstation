import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeArabic } from "@/lib/arabic";
import { expandQuery, matchCategorySlugs } from "@/lib/search-smart";
import { rateLimitGuard } from "@/lib/rate-limit";

export async function GET(req: Request) {
  // three DB queries per call — cap scripted hammering, typing stays smooth
  const limited = rateLimitGuard(req, "suggest", 60, 60_000);
  if (limited) return limited;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const norm = normalizeArabic(q);
  // smart matching: synonym groups ("ايفون" ⇄ "iphone") + implied categories
  const groups = expandQuery(q);
  const impliedSlugs = matchCategorySlugs(q).slice(0, 2);

  const [listings, categories, stores] = await Promise.all([
    db.listing.findMany({
      where: {
        status: "ACTIVE",
        ...(groups.length > 0
          ? {
              AND: groups.map((group) => ({
                OR: group.flatMap((t) => [
                  { searchText: { contains: t } },
                  { title: { contains: t } },
                ]),
              })),
            }
          : { searchText: { contains: norm } }),
      },
      select: { id: true, title: true, type: true, auction: { select: { id: true } } },
      orderBy: [{ isFeatured: "desc" }, { views: "desc" }],
      take: 5,
    }),
    db.category.findMany({
      where: {
        OR: [
          { slug: { in: impliedSlugs } },
          { nameAr: { contains: q } },
          { nameAr: { contains: norm } },
        ],
      },
      select: { slug: true, nameAr: true },
      take: 3,
    }),
    db.store.findMany({
      where: {
        user: { isBanned: false },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q.toLowerCase() } },
        ],
      },
      select: { slug: true, name: true, isVerified: true },
      orderBy: [{ isVerified: "desc" }, { createdAt: "asc" }],
      take: 2,
    }),
  ]);

  return NextResponse.json({
    suggestions: [
      ...categories.map((c) => ({
        type: "category" as const,
        label: c.nameAr,
        href: `/category/${c.slug}`,
      })),
      ...stores.map((s) => ({
        type: "store" as const,
        label: s.name,
        href: `/store/${s.slug}`,
        verified: s.isVerified,
      })),
      ...listings.map((l) => ({
        type: l.type === "AUCTION" ? ("auction" as const) : ("listing" as const),
        label: l.title,
        href: l.auction ? `/auctions/${l.auction.id}` : `/listings/${l.id}`,
      })),
    ],
  });
}
