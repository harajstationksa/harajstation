import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { applyProxyBids } from "@/lib/proxy-bid";
import { formatSAR } from "@/lib/utils";

const schema = z.object({ maxAmount: z.number().int().positive() });

/** Set (or raise) the caller's proxy-bid ceiling on this auction. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
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
  const maxAmount = parsed.data.maxAmount;

  try {
    const result = await db.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id },
        include: {
          listing: { select: { sellerId: true, title: true } },
          bids: {
            orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { bidderId: true, amount: true },
          },
        },
      });
      if (!auction) throw new ProxyError(404, "المزاد غير موجود");
      const now = new Date();
      if (auction.status !== "LIVE" || auction.endsAt <= now) {
        throw new ProxyError(409, "انتهى هذا المزاد ولا يقبل مزايدات جديدة");
      }
      if (auction.listing.sellerId === user.id) {
        throw new ProxyError(403, "لا يمكنك المزايدة على مزادك الخاص");
      }

      const top = auction.bids[0] ?? null;
      const minNext = top ? top.amount + auction.minIncrement : auction.startPrice;
      // the ceiling must at least allow one valid bid — unless you already
      // lead and are only raising your defense
      const alreadyTop = top?.bidderId === user.id;
      if (!alreadyTop && maxAmount < minNext) {
        throw new ProxyError(422, `حدك الأعلى يجب أن يكون ${formatSAR(minNext)} على الأقل`);
      }
      if (auction.buyNowPrice != null && maxAmount >= auction.buyNowPrice) {
        throw new ProxyError(
          422,
          `حدك الأعلى يتجاوز سعر الشراء الفوري (${formatSAR(auction.buyNowPrice)}) — استخدم الشراء الفوري بدلاً من ذلك`
        );
      }

      await tx.proxyBid.upsert({
        where: { auctionId_bidderId: { auctionId: id, bidderId: user.id } },
        create: { auctionId: id, bidderId: user.id, maxAmount },
        update: { maxAmount },
      });

      const prevTopBidderId = top?.bidderId ?? null;
      const resolved = await applyProxyBids(tx, id);
      return {
        title: auction.listing.title,
        prevTopBidderId,
        ...resolved,
      };
    });

    // notifications (outside the transaction)
    if (
      result.prevTopBidderId &&
      result.topBidderId &&
      result.prevTopBidderId !== result.topBidderId &&
      result.prevTopBidderId !== user.id
    ) {
      await notify(
        result.prevTopBidderId,
        "OUTBID",
        "تم تجاوز مزايدتك",
        `زايد شخص آخر على "${result.title}". المزايدة الحالية ${formatSAR(result.topAmount ?? 0)}.`,
        `/auctions/${id}`
      );
    }

    const youAreTop = result.topBidderId === user.id;
    return NextResponse.json({
      ok: true,
      youAreTop,
      currentBid: result.topAmount,
      maxAmount,
    });
  } catch (e) {
    if (e instanceof ProxyError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** Cancel the caller's proxy ceiling (existing bids stay — they're binding). */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }
  await db.proxyBid.deleteMany({
    where: { auctionId: id, bidderId: session.sub },
  });
  return NextResponse.json({ ok: true });
}

class ProxyError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
