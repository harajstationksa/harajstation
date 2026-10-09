import { db } from "./db";
import { notifyWithClient } from "./notify";
import { CONFIRM_WINDOW_HOURS } from "./constants";
import { formatSAR } from "./utils";
import { lockListing } from "./listing-policy";
import { applyProxyBids } from "./proxy-bid";
import type { Prisma } from "@prisma/client";

const FINALIZE_BATCH = 50;

/** Bounded reconciliation never overrides a concurrent moderation decision. */
export async function reconcileEndedAuctionListings() {
  const drifted = await db.auction.findMany({
    where: { status: { not: "LIVE" }, listing: { status: "ACTIVE" } },
    select: { listingId: true, status: true },
    orderBy: { id: "asc" },
    take: FINALIZE_BATCH,
  });
  for (const auction of drifted) {
    await db.listing.updateMany({
      where: { id: auction.listingId, status: "ACTIVE" },
      data: { status: auction.status === "ENDED" ? "SOLD" : "EXPIRED" },
    });
  }
}

export function displayListingStatus(
  listing: { status: string; type: string },
  auction: { status: string; endsAt: Date } | null | undefined,
  now: number = Date.now(),
): string {
  if (listing.type !== "AUCTION" || !auction) return listing.status;
  if (["REMOVED", "PENDING", "AWAITING_INFO"].includes(listing.status)) return listing.status;
  if (auction.status === "LIVE") return auction.endsAt.getTime() > now ? listing.status : "ENDED";
  return auction.status === "ENDED" ? "SOLD" : "EXPIRED";
}

/** Listing locks are shared with bidding; state and durable notices commit together. */
export async function finalizeExpiredAuctions() {
  const cancelled = await db.auction.findMany({
    where: {
      status: "LIVE",
      OR: [{ listing: { status: { not: "ACTIVE" } } }, { listing: { seller: { isBanned: true } } }],
    },
    select: { id: true, listingId: true },
    orderBy: { id: "asc" },
    take: FINALIZE_BATCH,
  });
  for (const candidate of cancelled) {
    await db.$transaction(
      async (tx) => {
        await lockListing(tx, candidate.listingId);
        const auction = await tx.auction.findUnique({
          where: { id: candidate.id },
          include: { listing: { include: { seller: { select: { isBanned: true } } } } },
        });
        if (
          !auction ||
          auction.status !== "LIVE" ||
          (auction.listing.status === "ACTIVE" && !auction.listing.seller.isBanned)
        )
          return;
        await tx.auction.update({ where: { id: auction.id }, data: { status: "CANCELLED" } });
        await tx.proxyBid.deleteMany({ where: { auctionId: auction.id } });
        const bidders = await tx.bid.findMany({
          where: { auctionId: auction.id },
          distinct: ["bidderId"],
          select: { bidderId: true },
        });
        await notifyWithClient(
          tx,
          [auction.listing.sellerId, ...bidders.map((b) => b.bidderId)],
          "SYSTEM",
          "تم إلغاء المزاد",
          `تم إلغاء مزاد "${auction.listing.title}" ولا يقبل مزايدات جديدة.`,
          `/auctions/${auction.id}`,
          `auction-cancelled:${auction.id}`,
        );
      },
      { timeout: 15_000 },
    );
  }
  await reconcileEndedAuctionListings();
  const expired = await db.auction.findMany({
    where: { status: "LIVE", endsAt: { lte: new Date() } },
    select: { id: true, listingId: true },
    orderBy: [{ endsAt: "asc" }, { id: "asc" }],
    take: FINALIZE_BATCH,
  });
  for (const candidate of expired) {
    await db.$transaction(
      async (tx) => {
        await lockListing(tx, candidate.listingId);
        const auction = await tx.auction.findUnique({
          where: { id: candidate.id },
          include: {
            listing: { include: { seller: { select: { isBanned: true } } } },
            // a banned account can never be declared the winner
            bids: {
              where: { bidder: { isBanned: false } },
              orderBy: [{ amount: "desc" }, { createdAt: "asc" }, { id: "asc" }],
              take: 1,
            },
          },
        });
        if (
          !auction ||
          auction.status !== "LIVE" ||
          auction.endsAt > new Date() ||
          auction.listing.status !== "ACTIVE" ||
          auction.listing.seller.isBanned
        )
          return;
        const top = auction.bids[0];
        await tx.auction.update({
          where: { id: auction.id },
          data: top
            ? { status: "ENDED", winnerId: top.bidderId, winningBid: top.amount }
            : { status: "NO_SALE" },
        });
        await tx.proxyBid.deleteMany({ where: { auctionId: auction.id } });
        await tx.listing.update({
          where: { id: auction.listingId },
          data: { status: top ? "SOLD" : "EXPIRED" },
        });
        if (!top) {
          await notifyWithClient(
            tx,
            [auction.listing.sellerId],
            "SYSTEM",
            "انتهى المزاد دون مزايدات",
            `انتهى مزاد "${auction.listing.title}" دون أي مزايدة.`,
            `/auctions/${auction.id}`,
            `auction-no-sale:${auction.id}`,
          );
          return;
        }
        await tx.transaction.create({
          data: {
            auctionId: auction.id,
            listingId: auction.listingId,
            sellerId: auction.listing.sellerId,
            buyerId: top.bidderId,
            amount: top.amount,
            source: "AUCTION",
            deadline: new Date(Date.now() + CONFIRM_WINDOW_HOURS * 3_600_000),
          },
        });
        await notifyWithClient(
          tx,
          [auction.listing.sellerId],
          "SOLD",
          "تهانينا! تم بيع مزادك",
          `تم بيع "${auction.listing.title}" بمبلغ ${formatSAR(top.amount)}. تواصل مع المشتري لترتيب التسليم.`,
          "/dashboard/verifications",
          `auction-sold:${auction.id}`,
        );
        await notifyWithClient(
          tx,
          [top.bidderId],
          "WON",
          "مبروك! فزت بالمزاد",
          `فزت بمزاد "${auction.listing.title}" بمبلغ ${formatSAR(top.amount)}. تواصل مع البائع لترتيب الاستلام.`,
          "/dashboard/verifications",
          `auction-won:${auction.id}`,
        );
      },
      { timeout: 15_000 },
    );
  }
}

/** Reuse for moderation/account deletion so cancellation never loses bidder notices. */
export async function cancelListingAuction(
  tx: import("@prisma/client").Prisma.TransactionClient,
  listingId: string,
  notifySeller = true,
) {
  await lockListing(tx, listingId);
  const auction = await tx.auction.findUnique({ where: { listingId }, include: { listing: true } });
  if (!auction || auction.status !== "LIVE") return;
  const bidders = await tx.bid.findMany({
    where: { auctionId: auction.id },
    distinct: ["bidderId"],
    select: { bidderId: true },
  });
  await tx.auction.update({ where: { id: auction.id }, data: { status: "CANCELLED" } });
  await tx.proxyBid.deleteMany({ where: { auctionId: auction.id } });
  await notifyWithClient(
    tx,
    [...(notifySeller ? [auction.listing.sellerId] : []), ...bidders.map((b) => b.bidderId)],
    "SYSTEM",
    "تم إلغاء المزاد",
    `تم إلغاء مزاد "${auction.listing.title}" ولا يقبل مزايدات جديدة.`,
    `/auctions/${auction.id}`,
    `auction-cancelled:${auction.id}`,
  );
}

/**
 * Withdraw every bid and ceiling `bidderId` holds on a LIVE auction. The bids
 * are archived in VoidedBid (never erased) and the remaining ceilings settle
 * against the new top. Caller must hold the listing lock.
 * Returns the new top bidder when the lead changed hands, else null.
 */
export async function voidBidderOnAuction(
  tx: Prisma.TransactionClient,
  auctionId: string,
  bidderId: string,
  reason: "SELLER_BLOCK" | "ACCOUNT_BAN",
  actorId: string | null,
): Promise<{ voided: number; newTopBidderId: string | null; previousTopBidderId: string | null }> {
  const order = [{ amount: "desc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }];
  const before = await tx.bid.findFirst({ where: { auctionId }, orderBy: order });
  const voided = await tx.$executeRaw`
    INSERT INTO "VoidedBid" (id, "auctionId", "bidderId", amount, "maskedName", anonymous, "bidAt", "voidedById", reason)
    SELECT id, "auctionId", "bidderId", amount, "maskedName", anonymous, "createdAt", ${actorId}, ${reason}
    FROM "Bid" WHERE "auctionId" = ${auctionId} AND "bidderId" = ${bidderId}
    ON CONFLICT (id) DO NOTHING`;
  await tx.bid.deleteMany({ where: { auctionId, bidderId } });
  await tx.proxyBid.deleteMany({ where: { auctionId, bidderId } });
  await applyProxyBids(tx, auctionId);
  const after = await tx.bid.findFirst({ where: { auctionId }, orderBy: order });
  const changed = before?.bidderId !== after?.bidderId;
  return {
    voided,
    newTopBidderId: changed ? (after?.bidderId ?? null) : null,
    previousTopBidderId: before?.bidderId ?? null,
  };
}

/** Ban side effect: pull the account out of every live auction it is bidding in. */
export async function voidBannedBidder(
  tx: Prisma.TransactionClient,
  bidderId: string,
  actorId: string,
) {
  const auctions = await tx.auction.findMany({
    where: {
      status: "LIVE",
      OR: [{ bids: { some: { bidderId } } }, { proxies: { some: { bidderId } } }],
    },
    select: { id: true, listingId: true, listing: { select: { title: true } } },
    orderBy: { listingId: "asc" },
  });
  for (const auction of auctions) {
    await lockListing(tx, auction.listingId);
    const result = await voidBidderOnAuction(tx, auction.id, bidderId, "ACCOUNT_BAN", actorId);
    if (result.newTopBidderId) {
      await notifyWithClient(
        tx,
        [result.newTopBidderId],
        "BID",
        "أصبحت صاحب أعلى مزايدة",
        `أُلغيت مزايدات حساب مخالف في مزاد "${auction.listing.title}"، وأصبحت الآن صاحب أعلى مزايدة.`,
        `/auctions/${auction.id}`,
      );
    }
  }
  return auctions.length;
}
