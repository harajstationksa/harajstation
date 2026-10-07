import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettingInt } from "@/lib/settings";

/** Referral program: code, invited users, commission history. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const [percent, referrals, earnings] = await Promise.all([
    getSettingInt("REFERRAL_PERCENT", 10),
    db.user.findMany({
      where: { referredById: user.id },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.referralEarning.findMany({
      where: { referrerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { referred: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    code: user.referralCode,
    percent,
    totalEarned: earnings.reduce((sum, e) => sum + e.points, 0),
    referrals: referrals.map((r) => ({
      id: r.id,
      name: r.name,
      joinedAt: r.createdAt.toISOString(),
    })),
    earnings: earnings.map((e) => ({
      id: e.id,
      points: e.points,
      from: e.referred.name,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}
