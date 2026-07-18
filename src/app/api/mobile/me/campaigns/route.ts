import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { adjustPoints } from "@/lib/points";
import { getSettingInt } from "@/lib/settings";
import { targetAudience } from "@/lib/targeting";
import { CITIES } from "@/lib/constants";
import { isRateLimited } from "@/lib/rate-limit";
import { parseJson } from "../../_lib/serialize";

/** The user's promotion campaigns. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const campaigns = await db.campaign.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { listing: { select: { id: true, title: true, images: true } } },
  });

  return NextResponse.json({
    items: campaigns.map((c) => ({
      id: c.id,
      status: c.status,
      days: c.days,
      endsAt: c.endsAt?.toISOString() ?? null,
      delivered: c.delivered,
      impressions: c.impressions,
      clicks: c.clicks,
      notified: c.notified,
      pointsSpent: c.pointsSpent,
      targetCity: c.targetCity,
      createdAt: c.createdAt.toISOString(),
      listing: {
        id: c.listing.id,
        title: c.listing.title,
        image: parseJson<string[]>(c.listing.images, [])[0] ?? null,
      },
    })),
  });
}

const createSchema = z.object({
  listingId: z.string().min(1),
  days: z.number().int().min(1).max(365),
  targetCity: z.string().optional().default(""),
});

/** Launch a campaign — JSON twin of the dashboard server action. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  if (await isRateLimited(`campaign:${user.id}`, 6, 60 * 60_000)) {
    return NextResponse.json(
      { error: "أنشأت حملات كثيرة خلال وقت قصير — انتظر قليلاً" },
      { status: 429 }
    );
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const { listingId, days } = parsed.data;
  const targetCity = parsed.data.targetCity.trim();
  if (targetCity && !(CITIES as readonly string[]).includes(targetCity)) {
    return NextResponse.json({ error: "مدينة الاستهداف غير معروفة" }, { status: 400 });
  }

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: { auction: true },
  });
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (listing.status !== "ACTIVE") {
    return NextResponse.json({ error: "الإعلان غير نشط" }, { status: 400 });
  }
  if (listing.isPromoted) {
    return NextResponse.json({ error: "الإعلان في حملة نشطة بالفعل" }, { status: 400 });
  }

  const rate = await getSettingInt("CAMPAIGN_POINTS_PER_DAY", 50);
  const cost = days * rate;
  if (user.points < cost) {
    return NextResponse.json(
      { error: `تحتاج ${cost} نقطة لهذه الحملة — رصيدك ${user.points}` },
      { status: 400 }
    );
  }

  const ok = await adjustPoints(user.id, -cost, `حملة إعلانية (${days} أيام): ${listing.title}`);
  if (ok === null) {
    return NextResponse.json({ error: "رصيد النقاط غير كافٍ" }, { status: 400 });
  }

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

  return NextResponse.json({ ok: true, campaignId: campaign.id, cost });
}
