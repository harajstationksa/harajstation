import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { parsePage } from "@/lib/pagination";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getTopupConfig } from "@/lib/settings";

/** Wallet: balance + point ledger + payment history. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: apiMessage(req, "غير مسجل") }, { status: 401 });

  const url = new URL(req.url);
  const page = parsePage(url.searchParams.get("page"));
  if (page === null)
    return NextResponse.json({ error: apiMessage(req, "رقم الصفحة غير صالح") }, { status: 400 });
  const pageSize = 30;

  const [ledger, payments, total, topup, paymentsTotal] = await Promise.all([
    db.pointTransaction.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.payment.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.pointTransaction.count({ where: { userId: user.id } }),
    getTopupConfig(),
    db.payment.count({ where: { userId: user.id } }),
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
    total,
    pageSize,
    paymentsTotal,
    paymentsHasMore: page * pageSize < paymentsTotal,
    hasMore: page * pageSize < total,
  });
}
