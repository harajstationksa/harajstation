import { db } from "./db";
import { notify } from "./notify";

/**
 * Price-drop nudge (cron): a listing that has been up for a week, got real
 * eyeballs, yet produced zero conversations and zero offers is almost always
 * mispriced. Tell the seller once — priceNudgeAt guards against re-nagging.
 */
export async function nudgePriceDrops() {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const stale = await db.listing.findMany({
    where: {
      status: "ACTIVE",
      type: { not: "AUCTION" },
      price: { not: null },
      createdAt: { lte: weekAgo },
      priceNudgeAt: null,
      views: { gte: 25 },
      convs: { none: {} },
      offers: { none: {} },
    },
    select: { id: true, sellerId: true, title: true, views: true },
    take: 50, // batched — the next cron minute picks up the rest
  });

  for (const listing of stale) {
    await db.listing.update({
      where: { id: listing.id },
      data: { priceNudgeAt: new Date() },
    });
    await notify(
      listing.sellerId,
      "SYSTEM",
      "إعلانك يُشاهد ولا يُشترى 👀",
      `"${listing.title}" شاهده ${listing.views} شخص دون أي رسالة أو عرض سعر — غالباً السعر أعلى من السوق. جرّب تخفيضه قليلاً أو حسّن الصور، ثم جدّد الإعلان ليعود لأول القائمة.`,
      `/dashboard/listings/${listing.id}/edit`
    );
  }
}
