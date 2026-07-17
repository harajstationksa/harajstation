import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  listingCardInclude,
  serializeListingCard,
  serializeUserPublic,
} from "../../_lib/serialize";

/** Public seller profile: stats, active listings, reviews received. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getSession();

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      city: true,
      credibility: true,
      successfulTx: true,
      idVerified: true,
      isPro: true,
      isBanned: true,
      avatarUrl: true,
      avatarColor: true,
      createdAt: true,
      stores: {
        select: { id: true, slug: true, name: true, logoUrl: true, isVerified: true },
      },
      _count: { select: { followers: true } },
    },
  });
  if (!user || user.isBanned) {
    return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  }

  const [listings, reviews, following] = await Promise.all([
    db.listing.findMany({
      where: { sellerId: id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: listingCardInclude,
    }),
    db.review.findMany({
      where: { targetId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } } },
    }),
    session
      ? db.follow.findUnique({
          where: { followerId_sellerId: { followerId: session.sub, sellerId: id } },
        })
      : null,
  ]);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : null;

  return NextResponse.json({
    ...serializeUserPublic(user),
    followers: user._count.followers,
    stores: user.stores,
    listings: listings.map(serializeListingCard),
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      author: r.author,
    })),
    avgRating,
    isFollowing: !!following,
    isMe: session?.sub === id,
  });
}
