import { db } from "./db";
import { encryptText } from "./crypto";
import { notify } from "./notify";
import { formatSAR } from "./utils";

/**
 * Structured price offers (سوم): negotiation as rows instead of chat noise.
 * PENDING   — buyer made an offer, seller hasn't answered
 * COUNTERED — seller answered with a counter price, buyer decides
 * ACCEPTED / REJECTED / WITHDRAWN — terminal
 */
export const OPEN_OFFER_STATUSES = ["PENDING", "COUNTERED"] as const;

export type OfferWithParties = NonNullable<
  Awaited<ReturnType<typeof getOfferWithParties>>
>;

export function getOfferWithParties(offerId: string) {
  return db.offer.findUnique({
    where: { id: offerId },
    include: {
      listing: { select: { id: true, title: true, sellerId: true, status: true } },
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
  agreedAmount: number
): Promise<string> {
  await db.offer.update({
    where: { id: offer.id },
    data: { status: "ACCEPTED", decidedAt: new Date() },
  });

  const conv = await db.conversation.upsert({
    where: {
      listingId_buyerId: { listingId: offer.listingId, buyerId: offer.buyerId },
    },
    create: {
      listingId: offer.listingId,
      buyerId: offer.buyerId,
      sellerId: offer.listing.sellerId,
    },
    update: {},
  });

  await db.message.create({
    data: {
      conversationId: conv.id,
      senderId: actorId,
      body: encryptText(
        `تم قبول عرض السعر: ${formatSAR(agreedAmount)} — «${offer.listing.title}». نكمل الاتفاق هنا؟`
      ),
    },
  });

  const otherId =
    actorId === offer.buyerId ? offer.listing.sellerId : offer.buyerId;
  await notify(
    otherId,
    "OFFER",
    "تم قبول عرض السعر 🎉",
    `اتفقتما على ${formatSAR(agreedAmount)} لـ"${offer.listing.title}" — أكملا التفاصيل في المحادثة.`,
    `/dashboard/messages/${conv.id}`
  );
  return conv.id;
}
