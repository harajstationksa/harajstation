import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { parsePage } from "@/lib/pagination";
import { db } from "@/lib/db";
import { arabicTerms } from "@/lib/arabic";
import { listingCardInclude, serializeListingCard } from "../_lib/serialize";

const PAGE_SIZE = 20;
/** Upper bound for the computed-price path (price range / price or bid ordering). */
const COMPUTED_SCAN_LIMIT = 2000;
const SORTS = ["time", "priceLow", "priceHigh", "mostBids"] as const;
type Sort = (typeof SORTS)[number];

function intParam(raw: string | null): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Live auctions, soonest-ending first. ?status=ENDED shows finished ones.
 * Filters: city, category, q (normalized Arabic search), min/max (current
 * bid, or start price without bids), withBids=1, outcome=ENDED|NO_SALE and
 * sort=time|priceLow|priceHigh|mostBids. `serverFilters: true` tells the app
 * it no longer has to page through the whole cohort to filter locally.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const page = parsePage(params.get("page"));
  if (page === null)
    return NextResponse.json({ error: apiMessage(req, "رقم الصفحة غير صالح") }, { status: 400 });
  const status = params.get("status") === "ENDED" ? "ENDED" : "LIVE";
  const city = params.get("city") || undefined;
  const category = params.get("category") || undefined;
  const terms = arabicTerms(params.get("q") ?? "").slice(0, 8);
  const min = intParam(params.get("min"));
  const max = intParam(params.get("max"));
  const withBids = params.get("withBids") === "1";
  const outcomeRaw = params.get("outcome");
  const outcome =
    status === "ENDED" && (outcomeRaw === "ENDED" || outcomeRaw === "NO_SALE")
      ? outcomeRaw
      : undefined;
  const sortRaw = params.get("sort") ?? "time";
  const sort: Sort = (SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as Sort) : "time";

  const auctionWhere: Prisma.AuctionWhereInput =
    status === "LIVE"
      ? { status, endsAt: { gt: new Date() } }
      : { status: outcome ?? { in: ["ENDED", "NO_SALE"] } };
  if (withBids) auctionWhere.bids = { some: {} };

  const where: Prisma.ListingWhereInput = {
    status: status === "LIVE" ? "ACTIVE" : { in: ["ACTIVE", "SOLD", "EXPIRED"] },
    seller: { isBanned: false },
    type: "AUCTION",
    auction: auctionWhere,
    ...(city ? { city } : {}),
    ...(category ? { category: { OR: [{ slug: category }, { parent: { slug: category } }] } } : {}),
    ...(terms.length ? { AND: terms.map((term) => ({ searchText: { contains: term } })) } : {}),
  };

  const computed = min !== undefined || max !== undefined || sort !== "time";
  let total: number;
  let rows: Awaited<ReturnType<typeof fetchCards>>;

  if (!computed) {
    [total, rows] = await Promise.all([
      db.listing.count({ where }),
      fetchCards({
        where,
        orderBy:
          status === "LIVE" ? { auction: { endsAt: "asc" } } : { auction: { endsAt: "desc" } },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
  } else {
    // Current price is max(bid) or the start price — not a column, so rank the
    // (small) auction cohort here, then load full cards for one page only.
    const cohort = await db.listing.findMany({
      where,
      take: COMPUTED_SCAN_LIMIT,
      select: {
        id: true,
        auction: {
          select: {
            startPrice: true,
            endsAt: true,
            bids: { orderBy: { amount: "desc" }, take: 1, select: { amount: true } },
            _count: { select: { bids: true } },
          },
        },
      },
    });
    const ranked = cohort
      .map((l) => ({
        id: l.id,
        price: l.auction?.bids[0]?.amount ?? l.auction?.startPrice ?? 0,
        bids: l.auction?._count.bids ?? 0,
        endsAt: l.auction?.endsAt.getTime() ?? 0,
      }))
      .filter((r) => (min === undefined || r.price >= min) && (max === undefined || r.price <= max))
      .sort((a, b) => {
        const byTime = status === "LIVE" ? a.endsAt - b.endsAt : b.endsAt - a.endsAt;
        const primary =
          sort === "priceLow"
            ? a.price - b.price
            : sort === "priceHigh"
              ? b.price - a.price
              : sort === "mostBids"
                ? b.bids - a.bids
                : byTime;
        return primary || byTime || a.id.localeCompare(b.id);
      });
    total = ranked.length;
    const pageIds = ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => r.id);
    const cards = pageIds.length ? await fetchCards({ where: { id: { in: pageIds } } }) : [];
    const order = new Map(pageIds.map((id, i) => [id, i]));
    rows = cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  return NextResponse.json({
    items: rows.map(serializeListingCard),
    page,
    pageSize: PAGE_SIZE,
    total,
    hasMore: page * PAGE_SIZE < total,
    serverFilters: true,
  });
}

function fetchCards(args: Omit<Prisma.ListingFindManyArgs, "include" | "select">) {
  return db.listing.findMany({ ...args, include: listingCardInclude });
}
