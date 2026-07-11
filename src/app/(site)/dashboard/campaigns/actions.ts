"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adjustPoints } from "@/lib/points";
import { getSettingInt } from "@/lib/settings";
import { targetAudience } from "@/lib/targeting";
import { CITIES } from "@/lib/constants";

/**
 * Launch a day-based promotion campaign for one of the user's listings.
 * Cost = days × CAMPAIGN_POINTS_PER_DAY (admin-tunable, like the day options).
 * For the whole duration the listing is sponsored: pinned first in its
 * category with the sponsored frame, rotating fairly with other funded ads.
 */
export async function createCampaignAction(formData: FormData) {
  const user = await requireUser();
  const listingId = String(formData.get("listingId"));
  const days = Number(formData.get("days"));
  // optional geo focus: "" = the whole kingdom
  const targetCity = String(formData.get("targetCity") ?? "").trim();
  if (targetCity && !(CITIES as readonly string[]).includes(targetCity)) {
    return { error: "مدينة الاستهداف غير معروفة" };
  }

  // any whole number of days works — the presets in the UI are just shortcuts
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return { error: "مدة الحملة يجب أن تكون عدداً صحيحاً بين يوم واحد و365 يوماً" };
  }

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: { auction: true },
  });
  if (!listing || listing.sellerId !== user.id) return { error: "غير مصرح" };
  if (listing.status !== "ACTIVE") return { error: "الإعلان غير نشط" };
  if (listing.isPromoted) return { error: "الإعلان في حملة نشطة بالفعل" };

  const rate = await getSettingInt("CAMPAIGN_POINTS_PER_DAY", 50);
  const cost = days * rate;
  if (user.points < cost) {
    return { error: `تحتاج ${cost} نقطة لهذه الحملة — رصيدك ${user.points}. اشحن نقاطك.` };
  }

  // charge points
  const ok = await adjustPoints(user.id, -cost, `حملة إعلانية (${days} أيام): ${listing.title}`);
  if (ok === null) return { error: "رصيد النقاط غير كافٍ" };

  // create campaign + promote listing until the campaign's end date
  const endsAt = new Date(Date.now() + days * 86_400_000);
  const campaign = await db.campaign.create({
    data: {
      listingId,
      ownerId: user.id,
      days,
      endsAt,
      pointsSpent: cost,
      status: "ACTIVE",
      targetCity,
    },
  });
  await db.listing.update({
    where: { id: listingId },
    data: { isPromoted: true, promotedUntil: endsAt },
  });

  // smart targeting — notify the best-match audience (capped to keep it sane);
  // a geo-focused campaign boosts users of the TARGET city, not the listing's
  const audience = await targetAudience(
    {
      id: listing.id,
      categoryId: listing.categoryId,
      city: targetCity || listing.city,
      sellerId: user.id,
    },
    200
  );
  const href = listing.auction ? `/auctions/${listing.auction.id}` : `/listings/${listing.id}`;
  if (audience.length > 0) {
    await db.notification.createMany({
      data: audience.map((a) => ({
        userId: a.userId,
        type: "SYSTEM",
        title: "قد يهمّك هذا الإعلان",
        body: `بناءً على اهتماماتك: "${listing.title}" في ${listing.city}.`,
        link: href,
      })),
    });
    await db.campaign.update({
      where: { id: campaign.id },
      data: { notified: audience.length },
    });
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard/listings");
  revalidatePath("/");
  return { ok: true, campaignId: campaign.id };
}

/** Stop an active campaign early (owner only). Points already spent are not refunded. */
export async function cancelCampaignAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("campaignId"));
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign || campaign.ownerId !== user.id) return;
  if (campaign.status !== "ACTIVE") return;
  await db.$transaction([
    db.campaign.update({
      where: { id },
      data: { status: "CANCELLED", endedAt: new Date() },
    }),
    db.listing.update({
      where: { id: campaign.listingId },
      data: { isPromoted: false, promotedUntil: null },
    }),
  ]);
  revalidatePath("/dashboard/campaigns");
}
