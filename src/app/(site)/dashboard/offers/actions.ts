"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import {
  getOfferWithParties,
  settleAcceptedOffer,
  OPEN_OFFER_STATUSES,
} from "@/lib/offers";
import { isRateLimited } from "@/lib/rate-limit";
import { formatSAR } from "@/lib/utils";

type ActionResult = { ok: true } | { error: string };

const MAX_AMOUNT = 100_000_000;

function refresh(listingId: string) {
  revalidatePath("/dashboard/offers");
  revalidatePath(`/listings/${listingId}`);
}

/** Buyer makes a price offer on a fixed-price / negotiable listing. */
export async function makeOfferAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (await isRateLimited(`offer:${user.id}`, 15, 3_600_000)) {
    return { error: "قدّمت عروضاً كثيرة خلال وقت قصير — حاول لاحقاً" };
  }

  const listingId = String(formData.get("listingId") ?? "");
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
    return { error: "أدخل مبلغاً صحيحاً" };
  }

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, title: true, sellerId: true, status: true, type: true },
  });
  if (!listing || listing.status !== "ACTIVE") return { error: "الإعلان غير متاح" };
  if (listing.type === "AUCTION") return { error: "المزادات تُساوَم بالمزايدة" };
  if (listing.sellerId === user.id) return { error: "لا يمكنك تقديم عرض على إعلانك" };

  const open = await db.offer.findFirst({
    where: {
      listingId,
      buyerId: user.id,
      status: { in: [...OPEN_OFFER_STATUSES] },
    },
  });
  if (open) return { error: "لديك عرض قائم على هذا الإعلان بالفعل" };

  await db.offer.create({ data: { listingId, buyerId: user.id, amount, note } });
  await notify(
    listing.sellerId,
    "OFFER",
    "عرض سعر جديد على إعلانك",
    `${user.name} يعرض ${formatSAR(amount)} على "${listing.title}"${note ? ` — «${note}»` : ""}`,
    "/dashboard/offers"
  );
  refresh(listingId);
  return { ok: true };
}

/** Seller accepts the buyer's amount (PENDING only). */
export async function acceptOfferAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const offer = await getOfferWithParties(String(formData.get("offerId") ?? ""));
  if (!offer || offer.listing.sellerId !== user.id) return { error: "غير مسموح" };
  if (offer.status !== "PENDING") return { error: "العرض لم يعد قائماً" };

  await settleAcceptedOffer(offer, user.id, offer.amount);
  refresh(offer.listingId);
  return { ok: true };
}

/** Seller rejects an open offer. */
export async function rejectOfferAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const offer = await getOfferWithParties(String(formData.get("offerId") ?? ""));
  if (!offer || offer.listing.sellerId !== user.id) return { error: "غير مسموح" };
  if (!OPEN_OFFER_STATUSES.includes(offer.status as never)) {
    return { error: "العرض لم يعد قائماً" };
  }

  await db.offer.update({
    where: { id: offer.id },
    data: { status: "REJECTED", decidedAt: new Date() },
  });
  await notify(
    offer.buyerId,
    "OFFER",
    "رد على عرضك",
    `اعتذر البائع عن عرضك على "${offer.listing.title}" — يمكنك تقديم عرض جديد بسعر أفضل.`,
    "/dashboard/offers?tab=sent"
  );
  refresh(offer.listingId);
  return { ok: true };
}

/** Seller counters with a different price (PENDING → COUNTERED). */
export async function counterOfferAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const offer = await getOfferWithParties(String(formData.get("offerId") ?? ""));
  const counter = Number(formData.get("counterAmount"));
  if (!offer || offer.listing.sellerId !== user.id) return { error: "غير مسموح" };
  if (offer.status !== "PENDING") return { error: "العرض لم يعد قائماً" };
  if (!Number.isInteger(counter) || counter < 1 || counter > MAX_AMOUNT) {
    return { error: "أدخل سعراً مضاداً صحيحاً" };
  }

  await db.offer.update({
    where: { id: offer.id },
    data: { status: "COUNTERED", counterAmount: counter },
  });
  await notify(
    offer.buyerId,
    "OFFER",
    "عرض مضاد من البائع",
    `البائع يقترح ${formatSAR(counter)} بدلاً من ${formatSAR(offer.amount)} لـ"${offer.listing.title}".`,
    "/dashboard/offers?tab=sent"
  );
  refresh(offer.listingId);
  return { ok: true };
}

/** Buyer accepts the seller's counter price (COUNTERED only). */
export async function acceptCounterAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const offer = await getOfferWithParties(String(formData.get("offerId") ?? ""));
  if (!offer || offer.buyerId !== user.id) return { error: "غير مسموح" };
  if (offer.status !== "COUNTERED" || offer.counterAmount == null) {
    return { error: "العرض لم يعد قائماً" };
  }

  await settleAcceptedOffer(offer, user.id, offer.counterAmount);
  refresh(offer.listingId);
  return { ok: true };
}

// void-returning variants for <form action={…}> (forms reject value-returning
// actions); the client components keep the result-returning originals
export async function acceptOfferForm(fd: FormData): Promise<void> {
  await acceptOfferAction(fd);
}
export async function rejectOfferForm(fd: FormData): Promise<void> {
  await rejectOfferAction(fd);
}
export async function acceptCounterForm(fd: FormData): Promise<void> {
  await acceptCounterAction(fd);
}
export async function withdrawOfferForm(fd: FormData): Promise<void> {
  await withdrawOfferAction(fd);
}

/** Buyer withdraws their open offer. */
export async function withdrawOfferAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const offer = await getOfferWithParties(String(formData.get("offerId") ?? ""));
  if (!offer || offer.buyerId !== user.id) return { error: "غير مسموح" };
  if (!OPEN_OFFER_STATUSES.includes(offer.status as never)) {
    return { error: "العرض لم يعد قائماً" };
  }

  await db.offer.update({
    where: { id: offer.id },
    data: { status: "WITHDRAWN", decidedAt: new Date() },
  });
  refresh(offer.listingId);
  return { ok: true };
}
