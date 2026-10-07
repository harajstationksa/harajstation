import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { listingCardInclude, serializeListingCard } from "../../_lib/serialize";

/** The user's favorite listings. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const favorites = await db.favorite.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { listing: { include: listingCardInclude } },
  });

  return NextResponse.json({
    items: favorites
      .filter((f) => f.listing.status !== "REMOVED")
      .map((f) => serializeListingCard(f.listing)),
  });
}
