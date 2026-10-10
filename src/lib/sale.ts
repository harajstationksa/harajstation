import { db } from "./db";
import { lockListing } from "./listing-policy";
import { validAmount } from "./listing-validation";
import { CONFIRM_WINDOW_DAYS, CONFIRM_WINDOW_HOURS } from "./constants";
import { notify, notifyMany } from "./notify";
import { formatSAR } from "./utils";

export type SaleCandidate = {
  buyer: { id: string; name: string; avatarColor: string; avatarUrl: string | null };
  viaChat: boolean;
  offerAmount: number | null;
  offerAccepted: boolean;
};

/**
 * People who actually engaged with a listing (chats + offers), one row per
 * buyer, accepted offers first. Null when the listing can't be marked sold by
 * this user (not theirs, not active, or a live auction).
 */
export async function saleCandidates(userId: string, listingId: string) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: { auction: true },
  });
  if (!listing || listing.sellerId !== userId) return null;
  if (listing.status !== "ACTIVE" || listing.auction?.status === "LIVE") return null;

  const buyerSelect = { select: { id: true, name: true, avatarColor: true, avatarUrl: true } };
  const [convs, offers] = await Promise.all([
    db.conversation.findMany({
      where: { listingId },
      include: { buyer: buyerSelect },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.offer.findMany({
      where: { listingId },
      include: { buyer: buyerSelect },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const byBuyer = new Map<string, SaleCandidate>();
  for (const c of convs) {
    byBuyer.set(c.buyerId, {
      buyer: c.buyer,
      viaChat: true,
      offerAmount: null,
      offerAccepted: false,
    });
  }
  for (const o of offers) {
    const existing = byBuyer.get(o.buyerId);
    const accepted = o.status === "ACCEPTED";
    const amount = accepted ? (o.counterAmount ?? o.amount) : o.amount;
    if (!existing) {
      byBuyer.set(o.buyerId, {
        buyer: o.buyer,
        viaChat: false,
        offerAmount: amount,
        offerAccepted: accepted,
      });
    } else if (accepted || existing.offerAmount == null) {
      existing.offerAmount = amount;
      existing.offerAccepted = existing.offerAccepted || accepted;
    }
  }
  const candidates = [...byBuyer.values()]
    .filter((c) => c.buyer.id !== userId)
    .sort((a, b) => Number(b.offerAccepted) - Number(a.offerAccepted));
  const suggestedAmount =
    candidates.find((c) => c.offerAccepted)?.offerAmount ?? listing.price ?? null;
  return { listing, candidates, suggestedAmount };
}

/**
 * Mark sold WITH a chosen buyer: mirrors the auction flow — a STANDARD
 * transaction opens the mutual-confirmation window, which feeds credibility,
 * the successful-deals counter and mutual reviews. Selling outside the
 * platform (no buyer) just closes the listing. Open offers from everyone else
 * are declined and those buyers told.
 */
export async function markSoldWithBuyer(
  userId: string,
  listingId: string,
  buyerIdRaw: string,
  amountRaw: number,
): Promise<{ ok: false } | { ok: true; txCreated: boolean }> {
  const buyerId = buyerIdRaw.trim();
  const result = await db.$transaction(async (tx) => {
    await lockListing(tx, listingId);
    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      include: { auction: true },
    });
    if (
      !listing ||
      listing.sellerId !== userId ||
      listing.status !== "ACTIVE" ||
      listing.auction?.status === "LIVE"
    )
      return null;
    let amount = 0,
      txCreated = false;
    if (buyerId && buyerId !== userId) {
      const [conv, offer] = await Promise.all([
        tx.conversation.findFirst({ where: { listingId, buyerId } }),
        tx.offer.findFirst({ where: { listingId, buyerId }, orderBy: { createdAt: "desc" } }),
      ]);
      if (conv || offer) {
        const accepted =
          offer?.status === "ACCEPTED" ? (offer.counterAmount ?? offer.amount) : null;
        amount = validAmount(amountRaw) ? amountRaw : (accepted ?? listing.price ?? 0);
        if (validAmount(amount)) {
          await tx.transaction.create({
            data: {
              listingId,
              sellerId: userId,
              buyerId,
              amount,
              source: "STANDARD",
              sellerAnswer: "YES",
              deadline: new Date(Date.now() + CONFIRM_WINDOW_HOURS * 3600000),
            },
          });
          txCreated = true;
        }
      }
    }
    await tx.listing.update({
      where: { id: listingId },
      data: { status: "SOLD", isFeatured: false, isPromoted: false },
    });
    const openOffers = await tx.offer.findMany({
      where: {
        listingId,
        status: { in: ["PENDING", "COUNTERED"] },
        ...(buyerId ? { buyerId: { not: buyerId } } : {}),
      },
      select: { id: true, buyerId: true },
    });
    await tx.offer.updateMany({
      where: { id: { in: openOffers.map((o) => o.id) } },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    return {
      title: listing.title,
      txCreated,
      amount,
      otherBuyers: openOffers.map((o) => o.buyerId),
    };
  });
  if (!result) return { ok: false };
  if (result.txCreated)
    await notify(
      buyerId,
      "CONFIRM",
      "أكّد إتمام الصفقة",
      `البائع أكّد بيع "${result.title}" لك بمبلغ ${formatSAR(result.amount)} — أكّد الاستلام خلال ${CONFIRM_WINDOW_DAYS} أيام.`,
      "/dashboard/verifications",
    );
  await notifyMany(
    result.otherBuyers,
    "OFFER",
    "انتهى العرض — تم البيع",
    `تم بيع "${result.title}".`,
    "/categories",
  );
  return { ok: true, txCreated: result.txCreated };
}
