"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { adjustPoints } from "@/lib/points";
import { getSettingInt } from "@/lib/settings";
import { getPlanLimits } from "@/lib/limits";
import { isRateLimited } from "@/lib/rate-limit";

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

/** Mark a listing as sold (owner only). */
export async function markSoldAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("listingId"));
  const listing = await db.listing.findUnique({ where: { id }, include: { auction: true } });
  if (!listing || listing.sellerId !== user.id) return;
  // live auctions can't be manually marked sold
  if (listing.auction && listing.auction.status === "LIVE") return;
  await db.listing.update({
    where: { id },
    data: { status: "SOLD", isFeatured: false, isPromoted: false },
  });
  revalidatePath("/dashboard/listings");
  revalidatePath("/");
}

/** Relist a sold/expired listing back to active (owner only). */
export async function relistAction(formData: FormData) {
  const user = await requireUser();
  // relisting resets createdAt, so the listing jumps back to the top of
  // "الأحدث" — cap it so nobody can bump-spam the feed in a loop
  if (isRateLimited(`relist:${user.id}`, 20, 24 * 3_600_000)) return;
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
    data: { status: "ACTIVE", createdAt: new Date() },
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
  await db.listing.delete({ where: { id } });
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
