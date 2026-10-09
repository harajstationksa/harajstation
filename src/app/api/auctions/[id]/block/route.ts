import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notifyWithClient } from "@/lib/notify";
import { lockListing } from "@/lib/listing-policy";
import { voidBidderOnAuction } from "@/lib/auction";
import { SNIPE_WINDOW_MS } from "@/lib/constants";
import { rateLimitGuard } from "@/lib/rate-limit";

// The seller points at a bid row, not a user id: anonymous bidders stay
// anonymous — the server resolves the identity and never returns it.
const schema = z.object({ bidId: z.string().min(1) });

/** Blocking in the closing minutes would let a seller strip the winner to steer the result. */
const BLOCK_CLOSES_BEFORE_END_MS = Math.max(SNIPE_WINDOW_MS, 10 * 60_000);

/**
 * Seller blocks a bidder from this auction and withdraws their bids. Runs
 * under the same listing lock and isolation as bidding, archives the bids in
 * VoidedBid and leaves an audit row, so the auction history stays complete.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitGuard(req, "auction-block", 10, 60_000);
  if (limited) return limited;

  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: apiMessage(req, "سجّل دخولك أولاً") }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: apiMessage(req, "طلب غير صالح") }, { status: 400 });
  }

  const runBlock = () =>
    db.$transaction(
      async (tx) => {
        const target = await tx.auction.findUnique({ where: { id }, select: { listingId: true } });
        if (!target) throw new BlockError(404, "المزاد غير موجود");
        await lockListing(tx, target.listingId);
        const auction = await tx.auction.findUnique({
          where: { id },
          include: { listing: { select: { sellerId: true, title: true } } },
        });
        if (!auction) throw new BlockError(404, "المزاد غير موجود");
        if (auction.listing.sellerId !== session.sub) {
          throw new BlockError(403, "هذا الإجراء لصاحب المزاد فقط");
        }
        const remaining = auction.endsAt.getTime() - Date.now();
        if (auction.status !== "LIVE" || remaining <= 0) {
          throw new BlockError(409, "انتهى هذا المزاد");
        }
        if (remaining < BLOCK_CLOSES_BEFORE_END_MS) {
          throw new BlockError(
            409,
            "لا يمكن حظر المزايدين في آخر 10 دقائق من المزاد — تواصل مع الدعم إن كانت هناك مخالفة",
          );
        }

        const bid = await tx.bid.findUnique({
          where: { id: parsed.data.bidId },
          select: { auctionId: true, bidderId: true },
        });
        if (!bid || bid.auctionId !== id) {
          throw new BlockError(404, "المزايدة غير موجودة");
        }

        await tx.auctionBlock.upsert({
          where: { auctionId_userId: { auctionId: id, userId: bid.bidderId } },
          create: { auctionId: id, userId: bid.bidderId },
          update: {},
        });
        const result = await voidBidderOnAuction(
          tx,
          id,
          bid.bidderId,
          "SELLER_BLOCK",
          session.sub,
        );
        await tx.auditLog.create({
          data: {
            actorId: session.sub,
            action: "SELLER_BLOCK_BIDDER",
            detail: `auction=${id}; bidder=${bid.bidderId}; voidedBids=${result.voided}`,
          },
        });
        await notifyWithClient(
          tx,
          [bid.bidderId],
          "SYSTEM",
          "تم حظرك من مزاد",
          `حظرك صاحب المزاد "${auction.listing.title}" من المزايدة فيه، وأُلغيت مزايداتك منه.`,
          `/auctions/${id}`,
        );
        if (result.newTopBidderId) {
          await notifyWithClient(
            tx,
            [result.newTopBidderId],
            "BID",
            "أصبحت صاحب أعلى مزايدة",
            `تغيّر ترتيب المزايدات في "${auction.listing.title}" وأصبحت الآن صاحب أعلى مزايدة.`,
            `/auctions/${id}`,
          );
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 },
    );

  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await runBlock();
        break;
      } catch (e) {
        const conflict = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
        if (!conflict || attempt >= 3) throw e;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BlockError) {
      return NextResponse.json({ error: apiMessage(req, e.message) }, { status: e.status });
    }
    throw e;
  }
}

class BlockError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
