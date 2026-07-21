import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notify";
import {
  CONFIRM_WINDOW_HOURS,
  SNIPE_EXTENSION_MS,
  SNIPE_WINDOW_MS,
} from "@/lib/constants";
import { applyProxyBids } from "@/lib/proxy-bid";
import { formatSAR, maskedBidderName } from "@/lib/utils";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({
  amount: z.number().int().positive(),
  // true = masked even for the seller; false = name visible to the seller only
  anonymous: z.boolean().optional().default(false),
});

class BidError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await rateLimitGuard(req, "bid", 20, 60_000);
  if (limited) return limited;

  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "سجّل دخولك للمزايدة" }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.isBanned) {
    return NextResponse.json({ error: "الحساب غير مصرح له" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "مبلغ غير صالح" }, { status: 400 });
  }
  const { amount, anonymous } = parsed.data;

  try {
    // Serializable: two bids landing in the same instant would otherwise both
    // read the same "top bid" and both pass the minimum-increment check.
    const runBid = () => db.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id },
        include: {
          listing: true,
          bids: { orderBy: { amount: "desc" }, take: 1 },
        },
      });
      if (!auction) throw new BidError(404, "المزاد غير موجود");

      const now = new Date();
      if (auction.status !== "LIVE" || auction.endsAt <= now) {
        throw new BidError(409, "انتهى هذا المزاد ولا يقبل مزايدات جديدة");
      }
      // anti-shill: seller can never bid on their own auction
      if (auction.listing.sellerId === user.id) {
        throw new BidError(403, "لا يمكنك المزايدة على مزادك الخاص");
      }

      const top = auction.bids[0] ?? null;
      const minNext = top ? top.amount + auction.minIncrement : auction.startPrice;
      if (amount < minNext) {
        throw new BidError(422, `الحد الأدنى للمزايدة هو ${formatSAR(minNext)}`);
      }

      const isBuyNow =
        auction.buyNowPrice != null && amount >= auction.buyNowPrice;

      // bid-sniping protection: bids in the last 2 minutes extend the timer
      let extended = false;
      if (!isBuyNow && auction.endsAt.getTime() - now.getTime() < SNIPE_WINDOW_MS) {
        extended = true;
      }

      await tx.bid.create({
        data: {
          auctionId: id,
          bidderId: user.id,
          amount: isBuyNow ? auction.buyNowPrice! : amount,
          maskedName: maskedBidderName(user.id, id),
          anonymous,
        },
      });

      if (isBuyNow) {
        await tx.auction.update({
          where: { id },
          data: {
            status: "ENDED",
            winnerId: user.id,
            winningBid: auction.buyNowPrice!,
            endsAt: now,
          },
        });
        await tx.listing.update({
          where: { id: auction.listingId },
          data: { status: "SOLD" },
        });
        await tx.transaction.create({
          data: {
            listingId: auction.listingId,
            sellerId: auction.listing.sellerId,
            buyerId: user.id,
            amount: auction.buyNowPrice!,
            source: "AUCTION",
            deadline: new Date(now.getTime() + CONFIRM_WINDOW_HOURS * 3_600_000),
          },
        });
      } else if (extended) {
        await tx.auction.update({
          where: { id },
          data: {
            endsAt: new Date(auction.endsAt.getTime() + SNIPE_EXTENSION_MS),
            extendedCount: { increment: 1 },
          },
        });
      }

      // proxy ceilings answer the manual bid (eBay-style agency bidding)
      let topBidderId: string | null = user.id;
      let topAmount = isBuyNow ? auction.buyNowPrice! : amount;
      if (!isBuyNow) {
        const resolved = await applyProxyBids(tx, id);
        if (resolved.topBidderId) {
          topBidderId = resolved.topBidderId;
          topAmount = resolved.topAmount ?? topAmount;
        }
      }

      return {
        listing: auction.listing,
        prevTopBidderId: top?.bidderId ?? null,
        isBuyNow,
        extended,
        finalAmount: isBuyNow ? auction.buyNowPrice! : topAmount,
        topBidderId,
        outbidByProxy: !isBuyNow && topBidderId !== user.id,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    // Serializable aborts one of two colliding transactions (P2034) — retry
    // the loser instead of surfacing an error to the bidder.
    let result: Awaited<ReturnType<typeof runBid>> | undefined;
    for (let attempt = 1; result === undefined; attempt++) {
      try {
        result = await runBid();
      } catch (e) {
        const conflict =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
        if (!conflict || attempt >= 3) throw e;
      }
    }

    // notifications (outside the transaction)
    if (
      result.prevTopBidderId &&
      result.prevTopBidderId !== user.id &&
      result.prevTopBidderId !== result.topBidderId
    ) {
      await notify(
        result.prevTopBidderId,
        "OUTBID",
        "تم تجاوز مزايدتك",
        `زايد شخص آخر على "${result.listing.title}". المزايدة الحالية ${formatSAR(result.finalAmount)}.`,
        `/auctions/${id}`
      );
    }
    if (result.outbidByProxy) {
      await notify(
        user.id,
        "OUTBID",
        "تجاوزك مزايد بالوكالة",
        `مزايدتك على "${result.listing.title}" قُبلت لكن مزايداً آخر وضع حداً أعلى منك — المزايدة الحالية ${formatSAR(result.finalAmount)}.`,
        `/auctions/${id}`
      );
    }
    if (result.isBuyNow) {
      await notify(
        result.listing.sellerId,
        "SOLD",
        "تم الشراء الفوري لمزادك",
        `اشترى أحد المستخدمين "${result.listing.title}" بسعر الشراء الفوري ${formatSAR(result.finalAmount)}. أكد التسليم خلال 48 ساعة.`,
        "/dashboard/verifications"
      );
      await notify(
        user.id,
        "WON",
        "مبروك! أتممت الشراء الفوري",
        `اشتريت "${result.listing.title}" بمبلغ ${formatSAR(result.finalAmount)}. تواصل مع البائع لترتيب الاستلام.`,
        "/dashboard/verifications"
      );
    } else {
      await notify(
        result.listing.sellerId,
        "BID",
        "مزايدة جديدة على مزادك",
        `مزايدة جديدة بمبلغ ${formatSAR(result.finalAmount)} على "${result.listing.title}".`,
        `/auctions/${id}`
      );
    }

    return NextResponse.json({
      ok: true,
      buyNow: result.isBuyNow,
      extended: result.extended,
    });
  } catch (e) {
    if (e instanceof BidError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
