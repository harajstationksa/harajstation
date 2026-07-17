import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listingCardInclude, serializeListingCard } from "../_lib/serialize";

const PAGE_SIZE = 20;

/** Live auctions, soonest-ending first. ?status=ENDED shows finished ones. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const status = url.searchParams.get("status") === "ENDED" ? "ENDED" : "LIVE";
  const city = url.searchParams.get("city") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;

  const where = {
    status: "ACTIVE",
    type: "AUCTION",
    auction: { status },
    ...(city ? { city } : {}),
    ...(category
      ? { category: { OR: [{ slug: category }, { parent: { slug: category } }] } }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      orderBy:
        status === "LIVE"
          ? { auction: { endsAt: "asc" } }
          : { auction: { endsAt: "desc" } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: listingCardInclude,
    }),
  ]);

  return NextResponse.json({
    items: rows.map(serializeListingCard),
    page,
    pageSize: PAGE_SIZE,
    total,
    hasMore: page * PAGE_SIZE < total,
  });
}
