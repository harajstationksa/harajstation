import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ listingId: string }> }
) {
  const { listingId } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const existing = await db.favorite.findUnique({
    where: { userId_listingId: { userId: session.sub, listingId } },
  });

  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } });
    return NextResponse.json({ fav: false });
  }

  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await db.favorite.create({ data: { userId: session.sub, listingId } });
  return NextResponse.json({ fav: true });
}
