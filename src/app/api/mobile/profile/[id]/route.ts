import { apiMessage } from "@/lib/api-messages";
import { parsePage } from "@/lib/pagination";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  listingCardInclude,
  serializeListingCard,
  serializeUserPublic,
} from "../../_lib/serialize";

/** Public seller profile: stats, active listings, reviews received. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const page = parsePage(new URL(req.url).searchParams.get("page"));
  if (page === null)
    return NextResponse.json({ error: apiMessage(req, "رقم الصفحة غير صالح") }, { status: 400 });
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
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          isVerified: true,
        },
      },
      _count: { select: { followers: true } },
    },
  });
  if (!user || user.isBanned) {
    return NextResponse.json({ error: apiMessage(req, "المستخدم غير موجود") }, { status: 404 });
  }

  const [listings, reviews, following] = await Promise.all([
    db.listing.findMany({
      where: { sellerId: id, status: "ACTIVE" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      skip: (page - 1) * 30,
      include: listingCardInclude,
    }),
    db.review.findMany({
      where: { targetId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      skip: (page - 1) * 30,
      include: {
        author: {
          select: { id: true, name: true, avatarUrl: true, avatarColor: true },
        },
      },
    }),
    session
      ? db.follow.findUnique({
          where: {
            followerId_sellerId: { followerId: session.sub, sellerId: id },
          },
        })
      : null,
  ]);

  const total = await db.listing.count({
    where: { sellerId: id, status: "ACTIVE" },
  });
  const stats = await db.review.aggregate({
    where: { targetId: id },
    _avg: { rating: true },
    _count: { id: true },
  });
  const avgRating = stats._avg.rating;
  return NextResponse.json({
    ...serializeUserPublic(user),
    followers: user._count.followers,
    stores: user.stores,
    listings: listings.map(serializeListingCard),
    page,
    pageSize: 30,
    total,
    hasMore: page * 30 < total,
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      author: r.author,
    })),
    avgRating,
    reviewsTotal: stats._count.id,
    reviewsHasMore: page * 30 < stats._count.id,
    isFollowing: !!following,
    isMe: session?.sub === id,
  });
}
