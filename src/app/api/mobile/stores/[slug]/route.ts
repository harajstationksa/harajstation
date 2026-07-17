import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { listingCardInclude, serializeListingCard } from "../../_lib/serialize";

/** Public store page: header, socials, listings, follow state. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const session = await getSession();

  const store = await db.store.findUnique({
    where: { slug },
    include: {
      user: {
        select: { id: true, name: true, credibility: true, idVerified: true },
      },
      _count: { select: { followers: true } },
    },
  });
  if (!store) {
    return NextResponse.json({ error: "المتجر غير موجود" }, { status: 404 });
  }

  const [listings, following] = await Promise.all([
    db.listing.findMany({
      where: { storeId: store.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: listingCardInclude,
    }),
    session
      ? db.storeFollow.findUnique({
          where: { storeId_userId: { storeId: store.id, userId: session.sub } },
        })
      : null,
  ]);

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
    isFollowing: !!following,
    isMine: session?.sub === store.user.id,
  });
}
