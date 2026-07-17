import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { recordListingView } from "@/lib/views";
import { fieldLabel } from "@/lib/category-fields";
import {
  listingCardInclude,
  parseJson,
  serializeListingCard,
  serializeUserPublic,
} from "../../_lib/serialize";

/** Full listing detail: gallery, seller, auction, comments, similar. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getSession();

  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      ...listingCardInclude,
      seller: {
        select: {
          id: true,
          name: true,
          city: true,
          credibility: true,
          successfulTx: true,
          idVerified: true,
          isPro: true,
          avatarUrl: true,
          avatarColor: true,
          createdAt: true,
          _count: { select: { listings: { where: { status: "ACTIVE" } }, followers: true } },
        },
      },
      store: {
        select: { id: true, slug: true, name: true, logoUrl: true, isVerified: true },
      },
      comments: {
        where: { isHidden: false },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
        },
      },
    },
  });

  if (!listing || listing.status === "REMOVED") {
    return NextResponse.json({ error: "الإعلان غير موجود" }, { status: 404 });
  }

  // fire-and-forget unique view (same rule as the web page)
  recordListingView(listing.id).catch(() => {});

  const mainSlug = listing.category.parent?.slug ?? listing.category.slug;
  const attributes = parseJson<Record<string, string>>(listing.attributes, {});

  const [similar, favorite, following] = await Promise.all([
    db.listing.findMany({
      where: {
        status: "ACTIVE",
        id: { not: listing.id },
        categoryId: listing.categoryId,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: listingCardInclude,
    }),
    session
      ? db.favorite.findUnique({
          where: { userId_listingId: { userId: session.sub, listingId: listing.id } },
        })
      : null,
    session
      ? db.follow.findUnique({
          where: {
            followerId_sellerId: { followerId: session.sub, sellerId: listing.sellerId },
          },
        })
      : null,
  ]);

  return NextResponse.json({
    ...serializeListingCard(listing),
    description: listing.description,
    phone: listing.showPhone ? listing.phone : null,
    whatsapp: listing.showPhone ? listing.whatsapp : null,
    expiresAt: listing.expiresAt?.toISOString() ?? null,
    attributeList: Object.entries(attributes).map(([key, value]) => ({
      key,
      label: fieldLabel(mainSlug, key),
      value,
    })),
    seller: {
      ...serializeUserPublic(listing.seller),
      activeListings: listing.seller._count.listings,
      followers: listing.seller._count.followers,
    },
    store: listing.store,
    comments: listing.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      user: c.user,
    })),
    similar: similar.map(serializeListingCard),
    isFavorite: !!favorite,
    isFollowingSeller: !!following,
    isMine: session?.sub === listing.sellerId,
  });
}
