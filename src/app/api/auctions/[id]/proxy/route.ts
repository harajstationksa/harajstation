import { apiMessage } from "@/lib/api-messages";
import { lockListing } from "@/lib/listing-policy";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notifyWithClient } from "@/lib/notify";
import { applyProxyBids } from "@/lib/proxy-bid";
import { formatSAR } from "@/lib/utils";
import { rateLimitGuard } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";
import { bidPolicyError } from "@/lib/bid-policy";
import { SNIPE_EXTENSION_MS, SNIPE_WINDOW_MS } from "@/lib/constants";

const schema = z.object({
  maxAmount: z.number().int().positive().max(2_000_000_000),
  // auto-bids placed by this ceiling inherit the flag (see Bid.anonymous)
  anonymous: z.boolean().optional().default(false),
});

/** Set (or raise) the caller's proxy-bid ceiling on this auction. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitGuard(req, "proxy-bid", 15, 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: apiMessage(req, "سجّل دخولك للمزايدة") }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.isBanned) {
    return NextResponse.json({ error: apiMessage(req, "الحساب غير مصرح له") }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: apiMessage(req, "مبلغ غير صالح") }, { status: 400 });
  }
  const { maxAmount, anonymous } = parsed.data;

  try {
    const runProxyBid = () =>
      db.$transaction(
        async (tx) => {
          const target = await tx.auction.findUnique({
            where: { id },
            select: { listingId: true },
          });
          if (target) await lockListing(tx, target.listingId);
          const auction = await tx.auction.findUnique({
            where: { id },
            include: {
              listing: { include: { seller: { select: { isBanned: true } } } },
              bids: {
                orderBy: [{ amount: "desc" }, { createdAt: "asc" }, { id: "asc" }],
                take: 1,
                select: { bidderId: true, amount: true },
              },
            },
          });
          if (!auction) throw new ProxyError(404, "المزاد غير موجود");
          const now = new Date();
          if (
            auction.listing.status !== "ACTIVE" ||
            auction.listing.seller.isBanned ||
            auction.status !== "LIVE" ||
            auction.endsAt <= now
          ) {
            throw new ProxyError(409, "انتهى هذا المزاد ولا يقبل مزايدات جديدة");
          }
          if (auction.listing.sellerId === user.id) {
            throw new ProxyError(403, "لا يمكنك المزايدة على مزادك الخاص");
          }
          const blocked = await tx.auctionBlock.findUnique({
            where: { auctionId_userId: { auctionId: id, userId: user.id } },
          });
          if (blocked) {
            throw new ProxyError(403, "حظرك صاحب المزاد من المزايدة في هذا المزاد");
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
              `حدك الأعلى يتجاوز سعر الشراء الفوري (${formatSAR(auction.buyNowPrice)}) — استخدم الشراء الفوري بدلاً من ذلك`,
            );
          }

          const policy = await bidPolicyError(tx, user, maxAmount, { minNext, isBuyNow: false });
          if (policy) throw new ProxyError(403, policy);

          await tx.proxyBid.upsert({
            where: { auctionId_bidderId: { auctionId: id, bidderId: user.id } },
            create: { auctionId: id, bidderId: user.id, maxAmount, anonymous },
            update: { maxAmount, anonymous },
          });

          const prevTopBidderId = top?.bidderId ?? null;
          const resolved = await applyProxyBids(tx, id);
          // A ceiling placed in the closing window bids for real, so it gets the
          // same anti-sniping extension as a manual bid.
          if (resolved.autoBids > 0 && auction.endsAt.getTime() - now.getTime() < SNIPE_WINDOW_MS) {
            await tx.auction.update({
              where: { id },
              data: {
                endsAt: new Date(auction.endsAt.getTime() + SNIPE_EXTENSION_MS),
                extendedCount: { increment: 1 },
              },
            });
          }
          const result = {
            title: auction.listing.title,
            prevTopBidderId,
            ...resolved,
          };
          // Notifications share the bid transaction.
          if (
            result.prevTopBidderId &&
            result.topBidderId &&
            result.prevTopBidderId !== result.topBidderId &&
            result.prevTopBidderId !== user.id
          ) {
            await notifyWithClient(
              tx,
              [result.prevTopBidderId],
              "OUTBID",
              "تم تجاوز مزايدتك",
              `زايد شخص آخر على "${result.title}". المزايدة الحالية ${formatSAR(result.topAmount ?? 0)}.`,
              `/auctions/${id}`,
            );
          }

          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

    let result: Awaited<ReturnType<typeof runProxyBid>> | undefined;
    for (let attempt = 1; result === undefined; attempt++) {
      try {
        result = await runProxyBid();
      } catch (error) {
        const conflict =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (!conflict || attempt >= 3) throw error;
      }
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
      return NextResponse.json({ error: apiMessage(req, e.message) }, { status: e.status });
    }
    throw e;
  }
}

/** Cancel the caller's proxy ceiling (existing bids stay — they're binding). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitGuard(_req, "proxy-delete", 15, 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: apiMessage(_req, "سجّل دخولك أولاً") }, { status: 401 });
  }
  const changed = await db.$transaction(async (tx) => {
    const target = await tx.auction.findUnique({ where: { id }, select: { listingId: true } });
    if (!target) return false;
    await lockListing(tx, target.listingId);
    const auction = await tx.auction.findUnique({ where: { id }, include: { listing: true } });
    if (
      !auction ||
      auction.status !== "LIVE" ||
      auction.endsAt <= new Date() ||
      auction.listing.status !== "ACTIVE"
    )
      return false;
    await tx.proxyBid.deleteMany({ where: { auctionId: id, bidderId: session.sub } });
    return true;
  });
  if (!changed)
    return NextResponse.json(
      { error: apiMessage(_req, "المزاد لا يقبل تعديل الوكالة") },
      { status: 409 },
    );
  return NextResponse.json({ ok: true });
}

class ProxyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
