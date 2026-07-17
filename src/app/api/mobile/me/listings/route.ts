import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { listingCardInclude, serializeListingCard } from "../../_lib/serialize";

/** The user's own listings, optionally filtered by ?status=. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  const rows = await db.listing.findMany({
    where: { sellerId: session.sub, ...(status ? { status } : { status: { not: "REMOVED" } }) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: listingCardInclude,
  });

  return NextResponse.json({ items: rows.map(serializeListingCard) });
}
