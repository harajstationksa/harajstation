import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { parsePage } from "@/lib/pagination";
import { db } from "@/lib/db";
import { listingCardInclude, serializeListingCard } from "../_lib/serialize";

const PAGE_SIZE = 20;

/** Live auctions, soonest-ending first. ?status=ENDED shows finished ones. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parsePage(url.searchParams.get("page"));
  if (page === null)
    return NextResponse.json({ error: apiMessage(req, "رقم الصفحة غير صالح") }, { status: 400 });
  const status = url.searchParams.get("status") === "ENDED" ? "ENDED" : "LIVE";
  const city = url.searchParams.get("city") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;

  const where = {
    status: status === "LIVE" ? "ACTIVE" : { in: ["ACTIVE", "SOLD", "EXPIRED"] },
    seller: { isBanned: false },
    type: "AUCTION",
    auction:
      status === "LIVE"
        ? { status, endsAt: { gt: new Date() } }
        : { status: { in: ["ENDED", "NO_SALE"] } },
    ...(city ? { city } : {}),
    ...(category
      ? {
          category: {
            OR: [{ slug: category }, { parent: { slug: category } }],
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      orderBy: status === "LIVE" ? { auction: { endsAt: "asc" } } : { auction: { endsAt: "desc" } },
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
