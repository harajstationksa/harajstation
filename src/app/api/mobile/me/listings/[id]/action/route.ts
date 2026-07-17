import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { adjustPoints } from "@/lib/points";
import { getSettingInt } from "@/lib/settings";
import { getPlanLimits } from "@/lib/limits";
import { notify } from "@/lib/notify";
import { isRateLimited } from "@/lib/rate-limit";

const schema = z.object({
  action: z.enum(["feature", "sold", "relist", "delete"]),
});

/**
 * Owner actions on a listing — the JSON twin of the dashboard server actions
 * (feature with points / mark sold / relist / delete), same rules.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const listing = await db.listing.findUnique({
    where: { id },
    include: { auction: true },
  });
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  switch (parsed.data.action) {
    case "feature": {
      const cost = await getSettingInt("FEATURE_POINT_COST", 100);
      if (listing.status !== "ACTIVE" || listing.isFeatured) {
        return NextResponse.json({ error: "الإعلان غير مؤهل للتمييز" }, { status: 400 });
      }
      if (user.points < cost) {
        return NextResponse.json(
          { error: `تحتاج ${cost} نقطة — رصيدك ${user.points}` },
          { status: 400 }
        );
      }
      const ok = await adjustPoints(user.id, -cost, "تمييز إعلان (7 أيام)");
      if (ok === null) {
        return NextResponse.json({ error: "رصيد النقاط غير كافٍ" }, { status: 400 });
      }
      await db.listing.update({
        where: { id },
        data: { isFeatured: true, featuredUntil: new Date(Date.now() + 7 * 86_400_000) },
      });
      await notify(
        user.id,
        "SYSTEM",
        "تم تمييز إعلانك",
        `أصبح "${listing.title}" إعلاناً مميزاً لمدة 7 أيام مقابل ${cost} نقطة.`,
        `/dashboard/listings`
      );
      return NextResponse.json({ ok: true });
    }

    case "sold": {
      if (listing.auction && listing.auction.status === "LIVE") {
        return NextResponse.json({ error: "لا يمكن إنهاء مزاد جارٍ يدوياً" }, { status: 400 });
      }
      await db.listing.update({
        where: { id },
        data: { status: "SOLD", isFeatured: false, isPromoted: false },
      });
      return NextResponse.json({ ok: true });
    }

    case "relist": {
      if (isRateLimited(`relist:${user.id}`, 20, 24 * 3_600_000)) {
        return NextResponse.json({ error: "محاولات كثيرة — حاول لاحقاً" }, { status: 429 });
      }
      if (!["SOLD", "EXPIRED"].includes(listing.status)) {
        return NextResponse.json({ error: "الإعلان غير قابل لإعادة النشر" }, { status: 400 });
      }
      const limits = await getPlanLimits(user.isPro);
      const activeCount = await db.listing.count({
        where: { sellerId: user.id, status: "ACTIVE", type: listing.type },
      });
      const max = listing.type === "AUCTION" ? limits.maxAuctions : limits.maxListings;
      if (activeCount >= max) {
        return NextResponse.json({ error: "وصلت الحد الأقصى للإعلانات النشطة" }, { status: 403 });
      }
      await db.listing.update({
        where: { id },
        data: { status: "ACTIVE", createdAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    case "delete": {
      if (listing.auction && listing.auction.status === "LIVE" && listing.auction.winnerId) {
        return NextResponse.json({ error: "لا يمكن حذف مزاد له فائز" }, { status: 400 });
      }
      await db.listing.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
  }
}
