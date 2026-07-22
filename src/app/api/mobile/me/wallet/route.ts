import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getTopupConfig } from "@/lib/settings";

/** Wallet: balance + point ledger + payment history. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = 30;

  const [ledger, payments, total, topup] = await Promise.all([
    db.pointTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    page === 1
      ? db.payment.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : [],
    db.pointTransaction.count({ where: { userId: user.id } }),
    getTopupConfig(),
  ]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return NextResponse.json({
    points: user.points,
    canClaimDaily: !user.lastDailyAt || user.lastDailyAt < startOfToday,
    // app hides the buy UI and shows the message while the admin pause is on
    topupEnabled: topup.enabled,
    topupMessage: topup.enabled ? null : topup.message,
    ledger: ledger.map((t) => ({
      id: t.id,
      delta: t.delta,
      reason: t.reason,
      createdAt: t.createdAt.toISOString(),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      points: p.points,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
    })),
    page,
    hasMore: page * pageSize < total,
  });
}
