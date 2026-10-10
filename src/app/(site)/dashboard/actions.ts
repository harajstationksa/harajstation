"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { featureListing, bumpListing, relistListing, removeOwnListing } from "@/lib/listing-policy";
import { markSoldWithBuyer } from "@/lib/sale";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { claimDailyPoints } from "@/lib/points";
import { isRateLimited } from "@/lib/rate-limit";

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

/** «تم البيع» form on the site — shared rules live in lib/sale.ts. */
export async function markSoldWithBuyerAction(formData: FormData) {
  const user = await requireUser();
  const result = await markSoldWithBuyer(
    user.id,
    String(formData.get("listingId")),
    String(formData.get("buyerId") ?? ""),
    Number(String(formData.get("amount") ?? "").trim()),
  );
  if (!result.ok) return;
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
