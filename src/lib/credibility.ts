import { Prisma } from "@prisma/client";
import { db } from "./db";
import { notify } from "./notify";
import { notifyWithClient } from "./notify";
import { CRED } from "./constants";

async function credit(tx: Prisma.TransactionClient, userId: string, delta: number, reason: string) {
  const changed =
    await tx.$executeRaw`UPDATE "User" SET credibility=LEAST(100,GREATEST(0,credibility+${delta})) WHERE id=${userId}`;
  if (changed) await tx.credibilityLog.create({ data: { userId, delta, reason } });
}
async function lockUsers(tx: Prisma.TransactionClient, ids: string[]) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY id FOR UPDATE`,
  );
}
export async function applyCredibility(userId: string, delta: number, reason: string) {
  if (!Number.isSafeInteger(delta) || Math.abs(delta) > 100) return;
  await db.$transaction((tx) => credit(tx, userId, delta, reason));
}
export async function evaluateTransaction(txId: string) {
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id=${txId} FOR UPDATE`;
    const t = await tx.transaction.findUnique({
      where: { id: txId },
      include: { listing: true },
    });
    if (!t || t.status !== "PENDING" || !t.sellerAnswer || !t.buyerAnswer) return null;
    const status =
      t.sellerAnswer === t.buyerAnswer
        ? t.sellerAnswer === "YES"
          ? "CONFIRMED"
          : "CANCELLED"
        : "DISPUTED";
    await tx.transaction.update({ where: { id: txId }, data: { status } });
    if (status === "CONFIRMED") {
      await lockUsers(tx, [t.sellerId, t.buyerId]);
      await tx.user.updateMany({
        where: { id: { in: [t.sellerId, t.buyerId] } },
        data: { successfulTx: { increment: 1 } },
      });
      for (const id of [t.sellerId, t.buyerId])
        await credit(tx, id, CRED.CONFIRMED_BOTH, "معاملة ناجحة (تأكيد متبادل)");
    }
    if (status === "DISPUTED") await tx.dispute.create({ data: { transactionId: txId } });
    return { ...t, status };
  });
  if (!result) return;
  const title =
    result.status === "CONFIRMED"
      ? "تم تأكيد المعاملة"
      : result.status === "CANCELLED"
        ? "تم إلغاء المعاملة"
        : "خلاف حول المعاملة";
  await Promise.all(
    [result.sellerId, result.buyerId].map((id) =>
      notify(
        id,
        result.status === "DISPUTED" ? "DISPUTE" : "CONFIRM",
        title,
        `تم تحديث معاملة "${result.listing.title}". راجع التفاصيل في حسابك.`,
        "/dashboard/verifications",
      ),
    ),
  );
}
export async function expirePendingTransactions() {
  const ids = await db.transaction.findMany({
    where: { status: "PENDING", deadline: { lte: new Date() } },
    select: { id: true },
  });
  for (const { id } of ids) {
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id=${id} FOR UPDATE`;
      const t = await tx.transaction.findUnique({
        where: { id },
        include: { listing: true },
      });
      if (!t || t.status !== "PENDING" || t.deadline > new Date()) return null;
      if (t.extStatus === "PENDING") {
        await tx.transaction.update({
          where: { id },
          data: {
            extStatus: "APPROVED",
            deadline: new Date(t.deadline.getTime() + (t.extDays ?? 0) * 86400000),
          },
        });
        return { ...t, extended: true };
      }
      const both = !t.sellerAnswer && !t.buyerAnswer;
      const answered = t.sellerAnswer || t.buyerAnswer;
      await tx.transaction.update({
        where: { id },
        data: { status: both || answered === "YES" ? "EXPIRED" : "CANCELLED" },
      });
      const users = both ? [t.sellerId, t.buyerId] : [!t.sellerAnswer ? t.sellerId : t.buyerId];
      await lockUsers(tx, users);
      for (const userId of users)
        await credit(
          tx,
          userId,
          both ? CRED.EXPIRED_BOTH : CRED.TIMEOUT_ONE_SIDE,
          "عدم الرد على تأكيد المعاملة خلال المهلة",
        );
      return { ...t, extended: false };
    });
    if (result)
      await Promise.all(
        [result.sellerId, result.buyerId].map((userId) =>
          notify(
            userId,
            "CONFIRM",
            result.extended ? "تم تمديد مهلة التحقق تلقائياً" : "انتهت مهلة التأكيد",
            `تم تحديث معاملة "${result.listing.title}". راجع تفاصيل المهلة في حسابك.`,
            "/dashboard/verifications",
          ),
        ),
      );
  }
}
export async function resolveDispute(
  disputeId: string,
  inFavorOf: "SELLER" | "BUYER",
  resolution: string,
  actorId: string,
  actorVersion: number,
) {
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Dispute" WHERE id=${disputeId} FOR UPDATE`;
    const dispute = await tx.dispute.findUnique({
      where: { id: disputeId },
      include: { transaction: { include: { listing: true } } },
    });
    if (!dispute || dispute.status === "RESOLVED") return null;
    const t = dispute.transaction;
    const winner = inFavorOf === "SELLER" ? t.sellerId : t.buyerId,
      loser = inFavorOf === "SELLER" ? t.buyerId : t.sellerId;
    await lockUsers(tx, [winner, loser, actorId]);
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    if (
      actor.isBanned ||
      actor.sessionVersion !== actorVersion ||
      !["ADMIN", "SUPPORT"].includes(actor.role)
    )
      throw new Error("STAFF_PERMISSION_CHANGED");
    await tx.dispute.update({
      where: { id: disputeId },
      data: {
        status: "RESOLVED",
        resolvedInFavorOf: inFavorOf,
        resolution,
        resolvedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "RESOLVE_DISPUTE",
        detail: `نزاع ${disputeId} — ${inFavorOf}`,
      },
    });
    await credit(tx, winner, CRED.DISPUTE_WINNER, "قرار الدعم: الطرف الصادق في النزاع");
    await credit(tx, loser, CRED.DISPUTE_LOSER, "قرار الدعم: الطرف المخالف في النزاع");
    await notifyWithClient(
      tx,
      [winner],
      "DISPUTE",
      "تم حل النزاع لصالحك",
      `قرار الدعم بشأن "${t.listing.title}".`,
      "/dashboard/verifications",
      `dispute:${disputeId}:winner`,
    );
    await notifyWithClient(
      tx,
      [loser],
      "DISPUTE",
      "تم حل النزاع ضدك",
      `قرار الدعم بشأن "${t.listing.title}".`,
      "/dashboard/verifications",
      `dispute:${disputeId}:loser`,
    );
    return { winner, loser, title: t.listing.title };
  });
  return result;
}
