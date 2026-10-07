import { apiMessage } from "@/lib/api-messages";
import { parsePage } from "@/lib/pagination";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { listingCardInclude, serializeListingCard } from "../../_lib/serialize";

/** Public store page: header, socials, listings, follow state. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const page = parsePage(new URL(req.url).searchParams.get("page"));
  if (page === null)
    return NextResponse.json({ error: apiMessage(req, "رقم الصفحة غير صالح") }, { status: 400 });
  const session = await getSession();

  const store = await db.store.findUnique({
    where: { slug, user: { isBanned: false } },
    include: {
      user: {
        select: { id: true, name: true, credibility: true, idVerified: true },
      },
      _count: { select: { followers: true } },
    },
  });
  if (!store) {
    return NextResponse.json({ error: apiMessage(req, "المتجر غير موجود") }, { status: 404 });
  }

  const [listings, following] = await Promise.all([
    db.listing.findMany({
      where: { storeId: store.id, status: "ACTIVE" },
      orderBy: [{ bumpedAt: "desc" }, { id: "desc" }],
      take: 30,
      skip: (page - 1) * 30,
      include: listingCardInclude,
    }),
    session
      ? db.storeFollow.findUnique({
          where: { storeId_userId: { storeId: store.id, userId: session.sub } },
        })
      : null,
  ]);

  const total = await db.listing.count({
    where: { storeId: store.id, status: "ACTIVE" },
  });
  return NextResponse.json({
    id: store.id,
    slug: store.slug,
    name: store.name,
    description: store.description,
    logoUrl: store.logoUrl,
    bannerUrl: store.bannerUrl,
    isVerified: store.isVerified,
    website: store.website,
    twitter: store.twitter,
    instagram: store.instagram,
    tiktok: store.tiktok,
    snapchat: store.snapchat,
    youtube: store.youtube,
    whatsapp: store.whatsapp,
    owner: store.user,
    followers: store._count.followers,
    createdAt: store.createdAt.toISOString(),
    listings: listings.map(serializeListingCard),
    page,
    pageSize: 30,
    total,
    hasMore: page * 30 < total,
    isFollowing: !!following,
    isMine: session?.sub === store.user.id,
  });
}
