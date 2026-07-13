import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const [session, auction, bidCount] = await Promise.all([
    getSession(),
    db.auction.findUnique({
      where: { id },
      include: {
        bids: {
          orderBy: { amount: "desc" },
          take: 20,
          select: {
            id: true,
            amount: true,
            maskedName: true,
            createdAt: true,
            bidderId: true,
          },
        },
        listing: { select: { sellerId: true } },
      },
    }),
    db.bid.count({ where: { auctionId: id } }),
  ]);

  const myProxy = session
    ? await db.proxyBid.findUnique({
        where: { auctionId_bidderId: { auctionId: id, bidderId: session.sub } },
        select: { maxAmount: true },
      })
    : null;

  if (!auction) {
    return NextResponse.json({ error: "المزاد غير موجود" }, { status: 404 });
  }

  const top = auction.bids[0];
  return NextResponse.json({
    status: auction.status,
    endsAt: auction.endsAt.toISOString(),
    serverNow: new Date().toISOString(),
    currentBid: top?.amount ?? auction.startPrice,
    minNext: top ? top.amount + auction.minIncrement : auction.startPrice,
    minIncrement: auction.minIncrement,
    bidCount,
    buyNowPrice: auction.buyNowPrice,
    isTopBidder: !!session && top?.bidderId === session.sub,
    isSeller: !!session && auction.listing.sellerId === session.sub,
    myProxyMax: myProxy?.maxAmount ?? null,
    winnerMasked:
      auction.status === "ENDED" && top ? top.maskedName : null,
    bids: auction.bids.map((b) => ({
      id: b.id,
      amount: b.amount,
      name: b.maskedName,
      at: b.createdAt.toISOString(),
      mine: !!session && b.bidderId === session.sub,
    })),
  });
}
