import type { Prisma } from "@prisma/client";
import { formatSAR } from "./utils";

/**
 * Who may bid, and how much. An auction has no deposit, so a throwaway account
 * that "wins" (or presses buy-now) and never shows up costs the seller the
 * whole sale. These rules make that griefing expensive without getting in the
 * way of ordinary buyers.
 */
export const BID_POLICY = {
  /** Accounts below this credibility (default 50, −3/−5 per abandoned deal) cannot bid. */
  MIN_CREDIBILITY: 30,
  /** An account is "established" after this age, a completed deal, or ID verification. */
  ESTABLISHED_AFTER_HOURS: 72,
  /** New, unverified accounts may commit at most this much (bid, ceiling or buy-now). */
  NEW_ACCOUNT_MAX_SAR: 20_000,
  /** A single bid may not exceed the next minimum bid by more than this factor. */
  MAX_JUMP_FACTOR: 10,
  /** …but small auctions always allow at least this absolute headroom. */
  MIN_JUMP_HEADROOM_SAR: 1_000,
  /** Unsettled auction wins a buyer may hold before bidding again. */
  MAX_OPEN_WINS: 2,
} as const;

type Bidder = {
  id: string;
  credibility: number;
  idVerified: boolean;
  successfulTx: number;
  createdAt: Date;
};

export function isEstablishedBidder(user: Bidder, now = Date.now()) {
  return (
    user.idVerified ||
    user.successfulTx > 0 ||
    now - user.createdAt.getTime() >= BID_POLICY.ESTABLISHED_AFTER_HOURS * 3_600_000
  );
}

/** Highest amount a single bid/ceiling may reach given the next valid minimum. */
export function maxBidFor(minNext: number) {
  return Math.max(minNext * BID_POLICY.MAX_JUMP_FACTOR, minNext + BID_POLICY.MIN_JUMP_HEADROOM_SAR);
}

/**
 * Returns an Arabic error when `user` may not commit `amount` on this auction,
 * or null when the bid is allowed. `amount` is what the bidder is committing
 * to: the bid itself, the proxy ceiling, or the buy-now price.
 */
export async function bidPolicyError(
  tx: Prisma.TransactionClient,
  user: Bidder,
  amount: number,
  opts: { minNext: number; isBuyNow: boolean },
): Promise<string | null> {
  if (user.credibility < BID_POLICY.MIN_CREDIBILITY) {
    return "مصداقية حسابك منخفضة بسبب صفقات سابقة لم تكتمل — لا يمكنك المزايدة حالياً";
  }
  if (!opts.isBuyNow && amount > maxBidFor(opts.minNext)) {
    return `المبلغ أعلى بكثير من السعر الحالي — أقصى مزايدة الآن ${formatSAR(maxBidFor(opts.minNext))}`;
  }
  if (!isEstablishedBidder(user) && amount > BID_POLICY.NEW_ACCOUNT_MAX_SAR) {
    return `الحسابات الجديدة تزايد حتى ${formatSAR(BID_POLICY.NEW_ACCOUNT_MAX_SAR)} — وثّق هويتك أو انتظر ${BID_POLICY.ESTABLISHED_AFTER_HOURS} ساعة من التسجيل`;
  }
  const openWins = await tx.transaction.count({
    where: { buyerId: user.id, source: "AUCTION", status: { in: ["PENDING", "DISPUTED"] } },
  });
  if (openWins >= BID_POLICY.MAX_OPEN_WINS) {
    return "لديك مزادات فزت بها ولم تكتمل بعد — أكمل استلامها أولاً ثم زايد من جديد";
  }
  return null;
}
