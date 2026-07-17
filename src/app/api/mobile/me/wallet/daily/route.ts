import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { adjustPoints } from "@/lib/points";

/** Claim the free daily points (once per calendar day). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (user.lastDailyAt && user.lastDailyAt >= startOfToday) {
    return NextResponse.json({ error: "استلمت نقاط اليوم بالفعل" }, { status: 400 });
  }

  const plan = await db.plan.findUnique({
    where: { key: user.isPro ? "PRO_MONTHLY" : "FREE" },
  });
  const amount = plan?.dailyPoints ?? 5;

  await db.user.update({ where: { id: user.id }, data: { lastDailyAt: new Date() } });
  await adjustPoints(user.id, amount, "نقاط يومية مجانية");

  return NextResponse.json({ ok: true, amount, points: user.points + amount });
}
