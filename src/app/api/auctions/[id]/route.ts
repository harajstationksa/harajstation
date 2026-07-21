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
            anonymous: true,
            createdAt: true,
            bidderId: true,
            bidder: { select: { name: true } },
          },
        },
        listing: { select: { id: true, sellerId: true } },
      },
    }),
    db.bid.count({ where: { auctionId: id } }),
  ]);

  const myProxy = session
    ? await db.proxyBid.findUnique({
        where: { auctionId_bidderId: { auctionId: id, bidderId: session.sub } },
        select: { maxAmount: true, anonymous: true },
      })
    : null;

  if (!auction) {
    return NextResponse.json({ error: "المزاد غير موجود" }, { status: 404 });
  }

  const top = auction.bids[0];
  const isSeller = !!session && auction.listing.sellerId === session.sub;
  const ended = auction.status === "ENDED";

  // the seller sees real names of bidders who chose to bid openly;
  // everyone else (including other bidders) only ever sees masked names
  const revealTo = (bid: { anonymous: boolean }) => isSeller && !bid.anonymous;

  const myLastBid = session
    ? auction.bids.find((b) => b.bidderId === session.sub)
    : null;

  return NextResponse.json({
    status: auction.status,
    endsAt: auction.endsAt.toISOString(),
    serverNow: new Date().toISOString(),
    listingId: auction.listing.id,
    currentBid: top?.amount ?? auction.startPrice,
    minNext: top ? top.amount + auction.minIncrement : auction.startPrice,
    minIncrement: auction.minIncrement,
    bidCount,
    buyNowPrice: auction.buyNowPrice,
    isTopBidder: !!session && top?.bidderId === session.sub,
    isSeller,
    myProxyMax: myProxy?.maxAmount ?? null,
    myAnonymous: myLastBid?.anonymous ?? myProxy?.anonymous ?? null,
    winnerMasked: ended && top ? top.maskedName : null,
    winnerAnonymous: ended && top ? top.anonymous : false,
    winnerName: ended && top && revealTo(top) ? top.bidder.name : null,
    winnerProfileId: ended && top && revealTo(top) ? top.bidderId : null,
    // the seller can always open a chat with the winner to arrange handover
    winnerChatId: ended && isSeller ? auction.winnerId : null,
    bids: auction.bids.map((b) => ({
      id: b.id,
      amount: b.amount,
      name: revealTo(b) ? b.bidder.name : b.maskedName,
      profileId: revealTo(b) ? b.bidderId : null,
      at: b.createdAt.toISOString(),
      mine: !!session && b.bidderId === session.sub,
    })),
  });
}
