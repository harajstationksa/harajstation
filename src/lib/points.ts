import type { Prisma } from "@prisma/client";
import { db } from "./db";

type PointsClient = Pick<Prisma.TransactionClient, "user" | "pointTransaction">;

/** Atomic balance mutation usable inside a larger business transaction. */
export async function adjustPointsWithClient(
  tx: PointsClient,
  userId: string,
  delta: number,
  reason: string
): Promise<number | null> {
  if (!Number.isSafeInteger(delta) || delta === 0) return null;
  const changed = await tx.user.updateMany({
    where: {
      id: userId,
      ...(delta < 0 ? { points: { gte: -delta } } : {}),
    },
    data: { points: { increment: delta } },
  });
  if (changed.count !== 1) return null;

  await tx.pointTransaction.create({ data: { userId, delta, reason } });
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { points: true },
  });
  return user?.points ?? null;
}

/**
 * Adjust a user's point balance and ledger atomically. A conditional UPDATE
 * prevents concurrent spends from both passing an earlier balance read.
 */
export async function adjustPoints(
  userId: string,
  delta: number,
  reason: string
): Promise<number | null> {
  return db.$transaction((tx) => adjustPointsWithClient(tx, userId, delta, reason));
}

/** Claim the daily grant exactly once for a supplied calendar-day boundary. */
export async function claimDailyPoints(
  userId: string,
  amount: number,
  startOfToday: Date
): Promise<number | null> {
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return db.$transaction(async (tx) => {
    const claimed = await tx.user.updateMany({
      where: {
        id: userId,
        OR: [{ lastDailyAt: null }, { lastDailyAt: { lt: startOfToday } }],
      },
      data: { lastDailyAt: new Date(), points: { increment: amount } },
    });
    if (claimed.count !== 1) return null;
    await tx.pointTransaction.create({
      data: { userId, delta: amount, reason: "نقاط يومية مجانية" },
    });
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { points: true },
    });
    return user?.points ?? null;
  });
}
