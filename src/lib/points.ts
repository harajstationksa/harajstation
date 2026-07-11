import { db } from "./db";

/**
 * Adjust a user's point balance and record a ledger entry, atomically.
 * Positive delta = credit (purchase/daily/refund), negative = spend.
 * Balance is clamped at 0. Returns the new balance, or null if it would
 * go negative (spend rejected).
 */
export async function adjustPoints(
  userId: string,
  delta: number,
  reason: string
): Promise<number | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  if (delta < 0 && user.points + delta < 0) return null; // insufficient
  const next = Math.max(0, user.points + delta);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { points: next } }),
    db.pointTransaction.create({ data: { userId, delta, reason } }),
  ]);
  return next;
}
