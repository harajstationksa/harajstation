"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CONFIRM_WINDOW_HOURS } from "@/lib/constants";
import { notify, notifyMany } from "@/lib/notify";
import { adjustPoints } from "@/lib/points";
import { getSettingInt } from "@/lib/settings";
import { getPlanLimits } from "@/lib/limits";
import { isRateLimited } from "@/lib/rate-limit";
import { deleteImages } from "@/lib/uploads";
import { formatSAR, parseImages } from "@/lib/utils";

export async function featureWithPointsAction(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId"));
  const cost = await getSettingInt("FEATURE_POINT_COST", 100);

  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.sellerId !== user.id) return;
  if (listing.status !== "ACTIVE" || listing.isFeatured) return;
  if (user.points < cost) return;

  const ok = await adjustPoints(user.id, -cost, "تمييز إعلان (7 أيام)");
  if (ok === null) return;
  await db.listing.update({
    where: { id: listingId },
    data: { isFeatured: true, featuredUntil: new Date(Date.now() + 7 * 86_400_000) },
  });

  await notify(
    user.id,
    "SYSTEM",
    "تم تمييز إعلانك",
    `أصبح "${listing.title}" إعلاناً مميزاً لمدة 7 أيام مقابل ${cost} نقطة.`,
    `/dashboard/listings`
  );

  revalidatePath("/dashboard/listings");
  revalidatePath("/");
}

/**
 * Renew («تجديد») a listing: lift it back to the top of its category and the
 * homepage feed. Free once every BUMP_FREE_HOURS since the last bump; renewing
 * sooner costs BUMP_POINT_COST points. Capped per day so the feed stays fair.
 */
export async function bumpListingAction(formData: FormData) {
  const user = await requireUser();
  if (await isRateLimited(`bump:${user.id}`, 30, 24 * 3_600_000)) return;
  const id = String(formData.get("listingId"));
  const [listing, freeHours, cost] = await Promise.all([
    db.listing.findUnique({ where: { id } }),
    getSettingInt("BUMP_FREE_HOURS", 48),
    getSettingInt("BUMP_POINT_COST", 15),
  ]);
  if (!listing || listing.sellerId !== user.id) return;
  if (listing.status !== "ACTIVE") return;

  const freeAt = listing.bumpedAt.getTime() + freeHours * 3_600_000;
  if (Date.now() < freeAt) {
    const ok = await adjustPoints(user.id, -cost, "تجديد إعلان قبل الموعد المجاني");
    if (ok === null) return;
  }
  await db.listing.update({ where: { id }, data: { bumpedAt: new Date() } });
  revalidatePath("/dashboard/listings");
  revalidatePath("/");
}

/**
 * Mark sold WITH a chosen buyer: mirrors the auction flow — a STANDARD
 * transaction opens the 48h mutual-confirmation window, which feeds
 * credibility, the successful-deals counter and mutual reviews. Selling
 * outside the platform (no buyer picked) just closes the listing.
 */
export async function markSoldWithBuyerAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("listingId"));
  const buyerId = String(formData.get("buyerId") ?? "").trim();
  const amountRaw = Number(String(formData.get("amount") ?? "").trim());

  const listing = await db.listing.findUnique({
    where: { id },
    include: { auction: true },
  });
  if (!listing || listing.sellerId !== user.id) return;
  if (listing.status !== "ACTIVE") return;
  if (listing.auction && listing.auction.status === "LIVE") return;

  let txCreated = false;
  if (buyerId && buyerId !== user.id) {
    // the chosen buyer must have actually engaged with this listing — a chat
    // or an offer — otherwise an arbitrary user id could be roped in
    const [conv, latestOffer] = await Promise.all([
      db.conversation.findFirst({ where: { listingId: id, buyerId } }),
      db.offer.findFirst({
        where: { listingId: id, buyerId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    if (conv || latestOffer) {
      const accepted =
        latestOffer?.status === "ACCEPTED"
          ? (latestOffer.counterAmount ?? latestOffer.amount)
          : null;
      const amount =
        Number.isInteger(amountRaw) && amountRaw > 0
          ? amountRaw
          : (accepted ?? listing.price ?? 0);
      if (amount > 0) {
        await db.transaction.create({
          data: {
            listingId: id,
            sellerId: user.id,
            buyerId,
            amount,
            source: "STANDARD",
            // the seller initiated this — their side is already a yes
            sellerAnswer: "YES",
            deadline: new Date(Date.now() + CONFIRM_WINDOW_HOURS * 3_600_000),
          },
        });
        await notify(
          buyerId,
          "CONFIRM",
          "أكّد إتمام الصفقة",
          `البائع أكّد بيع "${listing.title}" لك بمبلغ ${formatSAR(amount)} — أكّد الاستلام خلال ${CONFIRM_WINDOW_HOURS} ساعة ليُحتسب التقييم للطرفين.`,
          "/dashboard/verifications"
        );
        txCreated = true;
      }
    }
  }

  await db.listing.update({
    where: { id },
    data: { status: "SOLD", isFeatured: false, isPromoted: false },
  });

  // let the other bidders-by-offer know the item is gone (and close their offers)
  const openOffers = await db.offer.findMany({
    where: {
      listingId: id,
      status: { in: ["PENDING", "COUNTERED"] },
      ...(buyerId ? { buyerId: { not: buyerId } } : {}),
    },
    select: { id: true, buyerId: true },
  });
  if (openOffers.length > 0) {
    await db.offer.updateMany({
      where: { id: { in: openOffers.map((offer) => offer.id) } },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    await notifyMany(
      openOffers.map((offer) => offer.buyerId),
      "OFFER",
      "انتهى العرض — تم البيع",
      `تم بيع "${listing.title}" — تصفّح إعلانات مشابهة وقدّم عرضك التالي.`,
      "/categories"
    );
  }

  revalidatePath("/dashboard/listings");
  revalidatePath("/");
  redirect(txCreated ? "/dashboard/verifications" : "/dashboard/listings");
}

/** Relist a sold/expired listing back to active (owner only). */
export async function relistAction(formData: FormData) {
  const user = await requireUser();
  // relisting resets createdAt, so the listing jumps back to the top of
  // "الأحدث" — cap it so nobody can bump-spam the feed in a loop
  if (await isRateLimited(`relist:${user.id}`, 20, 24 * 3_600_000)) return;
  const id = String(formData.get("listingId"));
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing || listing.sellerId !== user.id) return;
  if (!["SOLD", "EXPIRED"].includes(listing.status)) return;

  const limits = await getPlanLimits(user.isPro);
  const activeCount = await db.listing.count({
    where: { sellerId: user.id, status: "ACTIVE", type: listing.type },
  });
  const max = listing.type === "AUCTION" ? limits.maxAuctions : limits.maxListings;
  if (activeCount >= max) return;

  await db.listing.update({
    where: { id },
    data: { status: "ACTIVE", createdAt: new Date(), bumpedAt: new Date() },
  });
  revalidatePath("/dashboard/listings");
  revalidatePath("/");
}

/** Permanently remove a listing (owner only). Cascades campaigns/views/etc. */
export async function deleteListingAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("listingId"));
  const listing = await db.listing.findUnique({
    where: { id },
    include: { auction: true },
  });
  if (!listing || listing.sellerId !== user.id) return;
  // block deleting an auction that has a pending/settled transaction
  if (listing.auction && listing.auction.status === "LIVE" && listing.auction.winnerId) return;
  // collect every stored file before the cascade wipes the rows that
  // reference them: the listing photos + any photos sent in its chats
  const chatImages = await db.message.findMany({
    where: { conversation: { listingId: id }, imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  const files = [
    ...parseImages(listing.images),
    ...chatImages.map((m) => m.imageUrl!),
  ];
  await db.listing.delete({ where: { id } });
  deleteImages(files).catch(() => {}); // best-effort storage cleanup
  revalidatePath("/dashboard/listings");
  revalidatePath("/");
}

/** Claim the daily free points for the user's plan (once per day). */
export async function claimDailyAction() {
  const user = await requireUser();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (user.lastDailyAt && user.lastDailyAt >= startOfToday) return;

  const plan = await db.plan.findUnique({
    where: { key: user.isPro ? "PRO_MONTHLY" : "FREE" },
  });
  const amount = plan?.dailyPoints ?? 5;

  await db.user.update({ where: { id: user.id }, data: { lastDailyAt: new Date() } });
  await adjustPoints(user.id, amount, "نقاط يومية مجانية");
  revalidatePath("/dashboard");
}
