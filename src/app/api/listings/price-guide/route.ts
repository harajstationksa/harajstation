import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { expandQuery } from "@/lib/search-smart";
import { rateLimitGuard } from "@/lib/rate-limit";

/**
 * Price guidance for the sell form: quartiles of what similar items go for in
 * the same (leaf) category — text-similar first, whole category as fallback.
 * A wrong asking price is the top reason a listing dies quietly; showing the
 * market range before publishing is the cheapest fix there is.
 */
export async function GET(req: Request) {
  const limited = await rateLimitGuard(req, "price-guide", 30, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const categoryId = url.searchParams.get("category") ?? "";
  const title = (url.searchParams.get("q") ?? "").slice(0, 100);
  if (!categoryId) return NextResponse.json({ count: 0 });

  const base: Prisma.ListingWhereInput = {
    categoryId,
    price: { not: null },
    // sold listings carry real market truth; active ones carry current asks
    status: { in: ["ACTIVE", "SOLD"] },
  };

  // first 3 term groups only — the full title over-restricts («فل كامل نظيف»)
  const groups = title ? expandQuery(title).slice(0, 3) : [];
  let rows: { price: number | null }[] = [];
  if (groups.length > 0) {
    rows = await db.listing.findMany({
      where: {
        ...base,
        AND: groups.map((group) => ({
          OR: group.flatMap((t) => [
            { searchText: { contains: t } },
            { title: { contains: t, mode: "insensitive" as const } },
          ]),
        })),
      },
      select: { price: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
  if (rows.length < 3) {
    rows = await db.listing.findMany({
      where: base,
      select: { price: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  const prices = rows
    .map((r) => r.price!)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);
  if (prices.length < 3) return NextResponse.json({ count: prices.length });

  const at = (f: number) =>
    prices[Math.min(prices.length - 1, Math.round(f * (prices.length - 1)))];
  return NextResponse.json({
    count: prices.length,
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
  });
}
