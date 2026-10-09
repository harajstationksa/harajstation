import { db } from "./db";
import { encryptText } from "./crypto";
import { notifyWithClient } from "./notify";
import { formatSAR } from "./utils";

/**
 * Structured price offers (سوم): negotiation as rows instead of chat noise.
 * PENDING   — buyer made an offer, seller hasn't answered
 * COUNTERED — seller answered with a counter price, buyer decides
 * ACCEPTED / REJECTED / WITHDRAWN — terminal
 */
export const OPEN_OFFER_STATUSES = ["PENDING", "COUNTERED"] as const;

export type OfferWithParties = NonNullable<Awaited<ReturnType<typeof getOfferWithParties>>>;

export function getOfferWithParties(offerId: string) {
  return db.offer.findUnique({
    where: { id: offerId },
    include: {
      listing: {
        select: { id: true, title: true, sellerId: true, status: true },
      },
      buyer: { select: { id: true, name: true } },
    },
  });
}

/**
 * Seal the agreement: mark the offer accepted, open (or reuse) the listing
 * conversation and drop an agreement message in it, then notify the other
 * side — acceptance should land both parties in a live chat, not a dead end.
 * Returns the conversation id.
 */
export async function settleAcceptedOffer(
  offer: OfferWithParties,
  actorId: string,
  agreedAmount: number,
): Promise<string | null> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Listing" WHERE id=${offer.listingId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Offer" WHERE id=${offer.id} FOR UPDATE`;
    const fresh = await tx.offer.findUnique({
      where: { id: offer.id },
      include: {
        listing: { include: { seller: { select: { isBanned: true } } } },
        buyer: { select: { isBanned: true } },
      },
    });
    const expected = actorId === offer.buyerId ? "COUNTERED" : "PENDING";
    if (
      !fresh ||
      fresh.status !== expected ||
      fresh.listing.status !== "ACTIVE" ||
      fresh.listing.seller.isBanned ||
      fresh.buyer.isBanned ||
      (expected === "PENDING"
        ? fresh.listing.sellerId !== actorId || fresh.amount !== agreedAmount
        : fresh.buyerId !== actorId || fresh.counterAmount !== agreedAmount)
    )
      return null;
    await tx.offer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED", decidedAt: new Date() },
    });
    const conv = await tx.conversation.upsert({
      where: {
        listingId_buyerId: {
          listingId: fresh.listingId,
          buyerId: fresh.buyerId,
        },
      },
      create: {
        listingId: fresh.listingId,
        buyerId: fresh.buyerId,
        sellerId: fresh.listing.sellerId,
      },
      update: {},
    });
    await tx.message.create({
      data: {
        conversationId: conv.id,
        senderId: actorId,
        body: encryptText(
          `تم قبول عرض السعر: ${formatSAR(agreedAmount)} — «${fresh.listing.title}». نكمل الاتفاق هنا؟`,
        ),
      },
    });
    const otherId = actorId === fresh.buyerId ? fresh.listing.sellerId : fresh.buyerId;
    await notifyWithClient(
      tx,
      [otherId],
      "OFFER",
      "تم قبول عرض السعر 🎉",
      `اتفقتما على ${formatSAR(agreedAmount)} لـ"${fresh.listing.title}" — أكملا التفاصيل في المحادثة.`,
      `/dashboard/messages/${conv.id}`,
      `offer-accepted:${fresh.id}`,
    );
    return conv.id;
  });
}
