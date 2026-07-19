import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listingCardInclude, serializeListingCard } from "../_lib/serialize";

/** Home feed: banners + featured + live auctions + latest listings. */
export async function GET() {
  const now = new Date();
  const [banners, featured, auctions, latest] = await Promise.all([
    db.banner.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        mobileImageUrl: true,
        linkUrl: true,
        position: true,
      },
    }),
    db.listing.findMany({
      where: { status: "ACTIVE", OR: [{ isFeatured: true }, { isPromoted: true }] },
      orderBy: { bumpedAt: "desc" },
      take: 10,
      include: listingCardInclude,
    }),
    db.listing.findMany({
      where: { status: "ACTIVE", type: "AUCTION", auction: { status: "LIVE" } },
      orderBy: { auction: { endsAt: "asc" } },
      take: 10,
      include: listingCardInclude,
    }),
    db.listing.findMany({
      where: { status: "ACTIVE" },
      orderBy: { bumpedAt: "desc" },
      take: 20,
      include: listingCardInclude,
    }),
  ]);

  return NextResponse.json({
    banners,
    featured: featured.map(serializeListingCard),
    auctions: auctions.map(serializeListingCard),
    latest: latest.map(serializeListingCard),
  });
}
