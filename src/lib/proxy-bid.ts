import type { Prisma } from "@prisma/client";
import { maskedBidderName } from "./utils";

/**
 * Proxy (agency) bidding — eBay-style. Each bidder may register a private
 * ceiling (ProxyBid). After every new bid (manual or a fresh ceiling), the
 * resolver lets the competing ceilings fight it out: the strongest proxy ends
 * on top paying just enough to beat the runner-up, never more than its max.
 *
 * Must run INSIDE the same DB transaction as the triggering bid.
 */
export async function applyProxyBids(
  tx: Prisma.TransactionClient,
  auctionId: string
): Promise<{ autoBids: number; topBidderId: string | null; topAmount: number | null }> {
  const auction = await tx.auction.findUnique({
    where: { id: auctionId },
    select: { startPrice: true, minIncrement: true, status: true, endsAt: true },
  });
  if (!auction || auction.status !== "LIVE") {
    return { autoBids: 0, topBidderId: null, topAmount: null };
  }

  let autoBids = 0;
  // convergence: each pass the leading opposing ceiling jumps straight to the
  // minimal winning amount, so 2-3 passes settle even a many-proxy fight
  for (let i = 0; i < 50; i++) {
    const top = await tx.bid.findFirst({
      where: { auctionId },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
      select: { bidderId: true, amount: true },
    });
    const needed = top ? top.amount + auction.minIncrement : auction.startPrice;

    // strongest ceiling that can still fight and isn't already on top
    const challengers = await tx.proxyBid.findMany({
      where: {
        auctionId,
        maxAmount: { gte: needed },
        ...(top ? { bidderId: { not: top.bidderId } } : {}),
      },
      orderBy: [{ maxAmount: "desc" }, { createdAt: "asc" }],
      take: 2,
    });
    const best = challengers[0];
    if (!best) break;

    // the amount that beats both the current top and the next-best rival —
    // capped at the challenger's own ceiling
    const rivalMax = Math.max(
      challengers[1]?.maxAmount ?? 0,
      // the current top bidder's own ceiling defends them
      top
        ? (
            await tx.proxyBid.findUnique({
              where: { auctionId_bidderId: { auctionId, bidderId: top.bidderId } },
              select: { maxAmount: true },
            })
          )?.maxAmount ?? 0
        : 0
    );
    const amount = Math.min(
      best.maxAmount,
      Math.max(needed, rivalMax + auction.minIncrement)
    );

    await tx.bid.create({
      data: {
        auctionId,
        bidderId: best.bidderId,
        amount,
        maskedName: maskedBidderName(best.bidderId, auctionId),
        anonymous: best.anonymous,
      },
    });
    autoBids++;
  }

  const finalTop = await tx.bid.findFirst({
    where: { auctionId },
    orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
    select: { bidderId: true, amount: true },
  });
  return {
    autoBids,
    topBidderId: finalTop?.bidderId ?? null,
    topAmount: finalTop?.amount ?? null,
  };
}
