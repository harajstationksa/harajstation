import { db } from "./db";
import { notify } from "./notify";
import { CRED } from "./constants";

/** Adjust a user's credibility score (clamped 0..100) and log the reason. */
export async function applyCredibility(
  userId: string,
  delta: number,
  reason: string
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const next = Math.max(0, Math.min(100, user.credibility + delta));
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { credibility: next } }),
    db.credibilityLog.create({ data: { userId, delta, reason } }),
  ]);
}

/**
 * Evaluate a pending transaction after one party answered.
 * Response matrix (spec §3):
 *   YES/YES → CONFIRMED (+5 both) · NO/NO → CANCELLED (no impact)
 *   YES/NO or NO/YES → DISPUTED (escalated to admin)
 */
export async function evaluateTransaction(txId: string) {
  const t = await db.transaction.findUnique({
    where: { id: txId },
    include: { listing: true, dispute: true },
  });
  if (!t || t.status !== "PENDING") return t;

  const { sellerAnswer, buyerAnswer } = t;
  if (!sellerAnswer || !buyerAnswer) return t; // wait for the other side

  if (sellerAnswer === "YES" && buyerAnswer === "YES") {
    await db.transaction.update({
      where: { id: t.id },
      data: { status: "CONFIRMED" },
    });
    await db.user.updateMany({
      where: { id: { in: [t.sellerId, t.buyerId] } },
      data: { successfulTx: { increment: 1 } },
    });
    await applyCredibility(t.sellerId, CRED.CONFIRMED_BOTH, "معاملة ناجحة (تأكيد متبادل)");
    await applyCredibility(t.buyerId, CRED.CONFIRMED_BOTH, "معاملة ناجحة (تأكيد متبادل)");
    for (const uid of [t.sellerId, t.buyerId]) {
      await notify(
        uid,
        "CONFIRM",
        "تم تأكيد المعاملة",
        `تم تأكيد معاملة "${t.listing.title}" من الطرفين. حصلت على +5 نقاط مصداقية.`,
        "/dashboard/verifications"
      );
    }
    return;
  }

  if (sellerAnswer === "NO" && buyerAnswer === "NO") {
    await db.transaction.update({
      where: { id: t.id },
      data: { status: "CANCELLED" },
    });
    for (const uid of [t.sellerId, t.buyerId]) {
      await notify(
        uid,
        "CONFIRM",
        "تم إلغاء المعاملة",
        `تم إلغاء معاملة "${t.listing.title}" باتفاق الطرفين دون تأثير على النقاط.`,
        "/dashboard/verifications"
      );
    }
    return;
  }

  // Conflict → dispute
  await db.$transaction([
    db.transaction.update({
      where: { id: t.id },
      data: { status: "DISPUTED" },
    }),
    db.dispute.create({ data: { transactionId: t.id } }),
  ]);
  for (const uid of [t.sellerId, t.buyerId]) {
    await notify(
      uid,
      "DISPUTE",
      "خلاف حول المعاملة",
      `هناك تعارض في الإجابات حول معاملة "${t.listing.title}". يرجى إرفاق ما يثبت موقفك وسيتواصل معكم فريق الدعم.`,
      "/dashboard/verifications"
    );
  }
}

/**
 * Lazy timeout handling — pending transactions past their 48h deadline.
 *   silence/silence → EXPIRED (-5 both) · answer/silence → non-responder -3
 */
export async function expirePendingTransactions() {
  const overdue = await db.transaction.findMany({
    where: { status: "PENDING", deadline: { lte: new Date() } },
    include: { listing: true },
  });

  for (const t of overdue) {
    const sellerSilent = !t.sellerAnswer;
    const buyerSilent = !t.buyerAnswer;

    if (sellerSilent && buyerSilent) {
      await db.transaction.update({
        where: { id: t.id },
        data: { status: "EXPIRED" },
      });
      await applyCredibility(t.sellerId, CRED.EXPIRED_BOTH, "تجاهل تأكيد المعاملة");
      await applyCredibility(t.buyerId, CRED.EXPIRED_BOTH, "تجاهل تأكيد المعاملة");
      continue;
    }

    const silentId = sellerSilent ? t.sellerId : t.buyerId;
    const answered = sellerSilent ? t.buyerAnswer : t.sellerAnswer;
    await db.transaction.update({
      where: { id: t.id },
      data: { status: answered === "YES" ? "EXPIRED" : "CANCELLED" },
    });
    await applyCredibility(
      silentId,
      CRED.TIMEOUT_ONE_SIDE,
      "عدم الرد على تأكيد المعاملة خلال المهلة"
    );
    await notify(
      silentId,
      "CONFIRM",
      "انتهت مهلة التأكيد",
      `لم ترد على طلب تأكيد معاملة "${t.listing.title}" خلال 48 ساعة، فخُصمت 3 نقاط من مصداقيتك.`,
      "/dashboard/verifications"
    );
  }
}

/** Admin dispute resolution: truthful party +5, dishonest party -15. */
export async function resolveDispute(
  disputeId: string,
  inFavorOf: "SELLER" | "BUYER",
  resolution: string,
  actorId: string
) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: { transaction: { include: { listing: true } } },
  });
  if (!dispute || dispute.status === "RESOLVED") return;

  const t = dispute.transaction;
  const winnerId = inFavorOf === "SELLER" ? t.sellerId : t.buyerId;
  const loserId = inFavorOf === "SELLER" ? t.buyerId : t.sellerId;

  await db.$transaction([
    db.dispute.update({
      where: { id: disputeId },
      data: {
        status: "RESOLVED",
        resolvedInFavorOf: inFavorOf,
        resolution,
        resolvedAt: new Date(),
      },
    }),
    db.auditLog.create({
      data: {
        actorId,
        action: "RESOLVE_DISPUTE",
        detail: `نزاع ${disputeId} — لصالح ${inFavorOf === "SELLER" ? "البائع" : "المشتري"}`,
      },
    }),
  ]);

  await applyCredibility(winnerId, CRED.DISPUTE_WINNER, "قرار الدعم: الطرف الصادق في النزاع");
  await applyCredibility(loserId, CRED.DISPUTE_LOSER, "قرار الدعم: الطرف المخالف في النزاع");

  await notify(
    winnerId,
    "DISPUTE",
    "تم حل النزاع لصالحك",
    `راجع فريق الدعم نزاع "${t.listing.title}" وحكم لصالحك. حصلت على +5 نقاط.`,
    "/dashboard/verifications"
  );
  await notify(
    loserId,
    "DISPUTE",
    "تم حل النزاع ضدك",
    `راجع فريق الدعم نزاع "${t.listing.title}" وحكم ضدك. خُصمت 15 نقطة من مصداقيتك.`,
    "/dashboard/verifications"
  );
}
