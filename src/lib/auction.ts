import { db } from "./db";
import { notify } from "./notify";
import { CONFIRM_WINDOW_HOURS } from "./constants";
import { formatSAR } from "./utils";

/**
 * Puts a listing back in step with an auction that is already over. The two
 * rows carry a status each and only the auction one is authoritative, so they
 * can drift apart: relisting an auction listing flipped it back to ACTIVE
 * while the auction row stayed ENDED (blocked since, but the rows it produced
 * are still out there), and the seller then saw «نشط» in the dashboard next to
 * an auction the public page already called closed — plus renew/feature
 * buttons that charge points for a listing nobody can bid on, and a slot taken
 * from their active-listing quota.
 *
 * Only ACTIVE rows are touched: SOLD/EXPIRED are already right, and
 * REMOVED/PENDING are moderation decisions that outrank the auction clock.
 * Normally matches nothing, so it is cheap to run on every cron tick.
 */
export async function reconcileEndedAuctionListings() {
  const drifted = await db.auction.findMany({
    where: { status: { not: "LIVE" }, listing: { status: "ACTIVE" } },
    select: { listingId: true, status: true },
  });
  if (drifted.length === 0) return;

  // ENDED means there was a winner and a transaction was opened; NO_SALE and
  // CANCELLED close the listing without a buyer
  const sold = drifted.filter((a) => a.status === "ENDED").map((a) => a.listingId);
  const expired = drifted.filter((a) => a.status !== "ENDED").map((a) => a.listingId);

  if (sold.length > 0) {
    await db.listing.updateMany({ where: { id: { in: sold } }, data: { status: "SOLD" } });
  }
  if (expired.length > 0) {
    await db.listing.updateMany({ where: { id: { in: expired } }, data: { status: "EXPIRED" } });
  }
}

/**
 * The status a listing should be *shown* with. For an auction the auction row
 * is the source of truth — `listing.status` trails it by up to a cron tick
 * (the finalizer runs every minute), so a listing whose hammer has fallen is
 * still ACTIVE in its own row for a moment. Returns the extra display-only
 * value "ENDED" for that window: the outcome isn't settled yet, so the badge
 * can't claim SOLD or EXPIRED.
 */
export function displayListingStatus(
  listing: { status: string; type: string },
  auction: { status: string; endsAt: Date } | null | undefined,
  now: number = Date.now()
): string {
  if (listing.type !== "AUCTION" || !auction) return listing.status;
  if (listing.status === "REMOVED" || listing.status === "PENDING") return listing.status;
  if (auction.status === "LIVE") {
    return auction.endsAt.getTime() > now ? listing.status : "ENDED";
  }
  return auction.status === "ENDED" ? "SOLD" : "EXPIRED";
}

/**
 * Locks expired LIVE auctions, determines winners and opens the
 * mutual-confirmation window. Only invoked via GET /api/cron — the server
 * must hit that endpoint every minute (deploy/cron.d-harajstation installed
 * as /etc/cron.d/harajstation) or ended auctions are never finalized and no
 * winner notifications go out.
 */
export async function finalizeExpiredAuctions() {
  await reconcileEndedAuctionListings();

  const expired = await db.auction.findMany({
    where: { status: "LIVE", endsAt: { lte: new Date() } },
    include: {
      listing: true,
      bids: { orderBy: { amount: "desc" }, take: 1 },
    },
  });

  for (const auction of expired) {
    const top = auction.bids[0];

    if (!top) {
      const finalized = await db.$transaction(async (tx) => {
        const locked = await tx.auction.updateMany({
          where: { id: auction.id, status: "LIVE", endsAt: { lte: new Date() } },
          data: { status: "NO_SALE" },
        });
        if (locked.count !== 1) return false;
        await tx.listing.update({
          where: { id: auction.listingId },
          data: { status: "EXPIRED" },
        });
        return true;
      }, { isolationLevel: "Serializable" });
      if (!finalized) continue;
      await notify(
        auction.listing.sellerId,
        "SYSTEM",
        "انتهى المزاد دون مزايدات",
        `انتهى مزاد "${auction.listing.title}" دون أي مزايدة. يمكنك إنشاء مزاد جديد في أي وقت.`,
        `/auctions/${auction.id}`
      );
      continue;
    }

    const deadline = new Date(
      Date.now() + CONFIRM_WINDOW_HOURS * 60 * 60 * 1000
    );

    const finalized = await db.$transaction(async (tx) => {
      const locked = await tx.auction.updateMany({
        where: { id: auction.id, status: "LIVE", endsAt: { lte: new Date() } },
        data: { status: "ENDED", winnerId: top.bidderId, winningBid: top.amount },
      });
      if (locked.count !== 1) return false;
      await tx.listing.update({
        where: { id: auction.listingId },
        data: { status: "SOLD" },
      });
      await tx.transaction.create({
        data: {
          auctionId: auction.id,
          listingId: auction.listingId,
          sellerId: auction.listing.sellerId,
          buyerId: top.bidderId,
          amount: top.amount,
          source: "AUCTION",
          deadline,
        },
      });
      return true;
    }, { isolationLevel: "Serializable" });
    if (!finalized) continue;

    await notify(
      auction.listing.sellerId,
      "SOLD",
      "تهانينا! تم بيع مزادك",
      `تم بيع "${auction.listing.title}" بمبلغ ${formatSAR(top.amount)}. تواصل مع المشتري لترتيب التسليم — بياناته في صفحة التحققات.`,
      "/dashboard/verifications"
    );
    await notify(
      top.bidderId,
      "WON",
      "مبروك! فزت بالمزاد",
      `فزت بمزاد "${auction.listing.title}" بمبلغ ${formatSAR(top.amount)}. تواصل مع البائع لترتيب الاستلام — بياناته في صفحة التحققات.`,
      "/dashboard/verifications"
    );
  }
}
