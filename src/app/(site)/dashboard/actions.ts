"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  featureListing,
  bumpListing,
  relistListing,
  removeOwnListing,
  lockListing,
} from "@/lib/listing-policy";
import { validAmount } from "@/lib/listing-validation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CONFIRM_WINDOW_DAYS, CONFIRM_WINDOW_HOURS } from "@/lib/constants";
import { notify, notifyMany } from "@/lib/notify";
import { claimDailyPoints } from "@/lib/points";
import { isRateLimited } from "@/lib/rate-limit";
import { formatSAR } from "@/lib/utils";

export async function featureWithPointsAction(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId"));
  const done = await featureListing(listingId, user.id);
  if (!done)
    redirect(
      "/dashboard/listings?error=" +
        encodeURIComponent("تعذّر التمييز: الإعلان غير متاح أو مميز بالفعل أو الرصيد غير كافٍ"),
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
  if (await isRateLimited(`bump:${user.id}`, 30, 24 * 3_600_000))
    redirect("/dashboard/listings?error=" + encodeURIComponent("وصلت للحد اليومي للتجديد"));
  const id = String(formData.get("listingId"));
  const done = await bumpListing(id, user.id);
  if (!done)
    redirect(
      "/dashboard/listings?error=" +
        encodeURIComponent(
          "تعذّر التجديد: تحقق من الرصيد وحالة الإعلان، وانتظر دقيقة بين المحاولات",
        ),
    );
  revalidatePath("/dashboard/listings");
  revalidatePath("/");
}

/**
 * Mark sold WITH a chosen buyer: mirrors the auction flow — a STANDARD
 * transaction opens the mutual-confirmation window, which feeds
 * credibility, the successful-deals counter and mutual reviews. Selling
 * outside the platform (no buyer picked) just closes the listing.
 */
export async function markSoldWithBuyerAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("listingId"));
  const buyerId = String(formData.get("buyerId") ?? "").trim();
  const amountRaw = Number(String(formData.get("amount") ?? "").trim());

  const result = await db.$transaction(async (tx) => {
    await lockListing(tx, id);
    const listing = await tx.listing.findUnique({
      where: { id },
      include: { auction: true },
    });
    if (
      !listing ||
      listing.sellerId !== user.id ||
      listing.status !== "ACTIVE" ||
      listing.auction?.status === "LIVE"
    )
      return null;
    let amount = 0,
      txCreated = false;
    if (buyerId && buyerId !== user.id) {
      const [conv, offer] = await Promise.all([
        tx.conversation.findFirst({ where: { listingId: id, buyerId } }),
        tx.offer.findFirst({
          where: { listingId: id, buyerId },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      if (conv || offer) {
        const accepted =
          offer?.status === "ACCEPTED" ? (offer.counterAmount ?? offer.amount) : null;
        amount = validAmount(amountRaw) ? amountRaw : (accepted ?? listing.price ?? 0);
        if (validAmount(amount)) {
          await tx.transaction.create({
            data: {
              listingId: id,
              sellerId: user.id,
              buyerId,
              amount,
              source: "STANDARD",
              sellerAnswer: "YES",
              deadline: new Date(Date.now() + CONFIRM_WINDOW_HOURS * 3600000),
            },
          });
          txCreated = true;
        }
      }
    }
    await tx.listing.update({
      where: { id },
      data: { status: "SOLD", isFeatured: false, isPromoted: false },
    });
    const openOffers = await tx.offer.findMany({
      where: {
        listingId: id,
        status: { in: ["PENDING", "COUNTERED"] },
        ...(buyerId ? { buyerId: { not: buyerId } } : {}),
      },
      select: { id: true, buyerId: true },
    });
    await tx.offer.updateMany({
      where: { id: { in: openOffers.map((o) => o.id) } },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    return {
      title: listing.title,
      txCreated,
      amount,
      otherBuyers: openOffers.map((o) => o.buyerId),
    };
  });
  if (!result) return;
  if (result.txCreated)
    await notify(
      buyerId,
      "CONFIRM",
      "أكّد إتمام الصفقة",
      `البائع أكّد بيع "${result.title}" لك بمبلغ ${formatSAR(result.amount)} — أكّد الاستلام خلال ${CONFIRM_WINDOW_DAYS} أيام.`,
      "/dashboard/verifications",
    );
  await notifyMany(
    result.otherBuyers,
    "OFFER",
    "انتهى العرض — تم البيع",
    `تم بيع "${result.title}".`,
    "/categories",
  );
  revalidatePath("/dashboard/listings");
  revalidatePath("/");
  redirect(result.txCreated ? "/dashboard/verifications" : "/dashboard/listings");
}

/** Relist a sold/expired listing back to active (owner only). */
export async function relistAction(formData: FormData) {
  const user = await requireUser();
  // relisting resets createdAt, so the listing jumps back to the top of
  // "الأحدث" — cap it so nobody can bump-spam the feed in a loop
  if (await isRateLimited(`relist:${user.id}`, 20, 24 * 3_600_000))
    redirect("/dashboard/listings?error=" + encodeURIComponent("وصلت للحد اليومي لإعادة النشر"));
  const id = String(formData.get("listingId"));
  const done = await relistListing(id, user);
  if (!done)
    redirect(
      "/dashboard/listings?error=" +
        encodeURIComponent(
          "تعذّرت إعادة النشر: تحقق من حد الباقة وحالة الإعلان؛ المزاد يحتاج إعلانًا جديدًا",
        ),
    );
  revalidatePath("/dashboard/listings");
  revalidatePath("/");
}

/** Hide eligible listings without erasing transaction or conversation history. */
export async function deleteListingAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("listingId"));
  await removeOwnListing(id, user.id);
  revalidatePath("/dashboard/listings");
  revalidatePath("/");
}

/** Claim the daily free points for the user's plan (once per day). */
export async function claimDailyAction() {
  const user = await requireUser();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const plan = await db.plan.findUnique({
    where: { key: user.isPro ? "PRO_MONTHLY" : "FREE" },
  });
  const amount = plan?.dailyPoints ?? 5;

  await claimDailyPoints(user.id, amount, startOfToday);
  revalidatePath("/dashboard");
}
