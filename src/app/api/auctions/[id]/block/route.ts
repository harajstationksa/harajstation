import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { applyProxyBids } from "@/lib/proxy-bid";
import { rateLimitGuard } from "@/lib/rate-limit";

// The seller points at a bid row, not a user id: anonymous bidders stay
// anonymous — the server resolves the identity and never returns it.
const schema = z.object({ bidId: z.string().min(1) });

/** Seller blocks a bidder from this auction and removes their bids. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await rateLimitGuard(req, "auction-block", 10, 60_000);
  if (limited) return limited;

  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id },
        include: { listing: { select: { sellerId: true, title: true } } },
      });
      if (!auction) throw new BlockError(404, "المزاد غير موجود");
      if (auction.listing.sellerId !== session.sub) {
        throw new BlockError(403, "هذا الإجراء لصاحب المزاد فقط");
      }
      if (auction.status !== "LIVE" || auction.endsAt <= new Date()) {
        throw new BlockError(409, "انتهى هذا المزاد");
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
      // their bids stop propping the price up, and their ceiling stops firing
      await tx.bid.deleteMany({ where: { auctionId: id, bidderId: bid.bidderId } });
      await tx.proxyBid.deleteMany({
        where: { auctionId: id, bidderId: bid.bidderId },
      });
      // remaining ceilings settle against the new (possibly lower) top bid
      await applyProxyBids(tx, id);

      return { blockedId: bid.bidderId, title: auction.listing.title };
    });

    await notify(
      result.blockedId,
      "SYSTEM",
      "تم حظرك من مزاد",
      `حظرك صاحب المزاد "${result.title}" من المزايدة فيه، وأُزيلت مزايداتك منه.`,
      `/auctions/${id}`
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BlockError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

class BlockError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
