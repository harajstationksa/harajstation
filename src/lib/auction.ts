import { db } from "./db";
import { notify } from "./notify";
import { CONFIRM_WINDOW_HOURS } from "./constants";
import { formatSAR } from "./utils";

/**
 * Lazy finalization — locks expired LIVE auctions, determines winners and
 * opens the 48h mutual-confirmation window. Called from auction read paths
 * so no cron is needed in dev; in production this becomes a background job.
 */
export async function finalizeExpiredAuctions() {
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
      await db.$transaction([
        db.auction.update({
          where: { id: auction.id },
          data: { status: "NO_SALE" },
        }),
        db.listing.update({
          where: { id: auction.listingId },
          data: { status: "EXPIRED" },
        }),
      ]);
      await notify(
        auction.listing.sellerId,
        "SYSTEM",
        "انتهى المزاد دون مزايدات",
        `انتهى مزاد "${auction.listing.title}" دون أي مزايدة. يمكنك إعادة نشره في أي وقت.`,
        `/auctions/${auction.id}`
      );
      continue;
    }

    const deadline = new Date(
      Date.now() + CONFIRM_WINDOW_HOURS * 60 * 60 * 1000
    );

    await db.$transaction([
      db.auction.update({
        where: { id: auction.id },
        data: { status: "ENDED", winnerId: top.bidderId, winningBid: top.amount },
      }),
      db.listing.update({
        where: { id: auction.listingId },
        data: { status: "SOLD" },
      }),
      db.transaction.create({
        data: {
          listingId: auction.listingId,
          sellerId: auction.listing.sellerId,
          buyerId: top.bidderId,
          amount: top.amount,
          source: "AUCTION",
          deadline,
        },
      }),
    ]);

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
