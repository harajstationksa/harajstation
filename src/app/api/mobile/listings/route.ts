import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildListingWhere, listingOrderBy, type SP } from "@/lib/listing-query";
import { listingCardInclude, serializeListingCard } from "../_lib/serialize";

const PAGE_SIZE = 20;

/**
 * Browse/search listings — same filters as the website's category & search
 * pages: q, category, city, condition, type, min, max, featured, sort, page.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp: SP = Object.fromEntries(url.searchParams.entries());
  const page = Number(sp.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    return NextResponse.json({ error: apiMessage(req, "رقم الصفحة غير صالح") }, { status: 400 });
  for (const key of ["min", "max"]) {
    if (
      sp[key] !== undefined &&
      (!Number.isSafeInteger(Number(sp[key])) ||
        Number(sp[key]) < 0 ||
        Number(sp[key]) > 2_000_000_000)
    )
      return NextResponse.json({ error: apiMessage(req, "السعر غير صالح") }, { status: 400 });
  }

  const where = buildListingWhere(sp);
  const [total, rows] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      orderBy: [
        { isPromoted: "desc" },
        { isFeatured: "desc" },
        listingOrderBy(typeof sp.sort === "string" ? sp.sort : undefined),
      ],
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
