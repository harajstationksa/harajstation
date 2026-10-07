import { db } from "./db";
import { notifyWithClient } from "./notify";
import { CONFIRM_WINDOW_HOURS } from "./constants";
import { formatSAR } from "./utils";
import { lockListing } from "./listing-policy";

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
            bids: { orderBy: [{ amount: "desc" }, { createdAt: "asc" }, { id: "asc" }], take: 1 },
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
