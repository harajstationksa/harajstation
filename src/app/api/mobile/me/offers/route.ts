import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePage } from "@/lib/pagination";
import { parseImages } from "@/lib/utils";
import {
  makeOfferAction,
  acceptOfferAction,
  rejectOfferAction,
  counterOfferAction,
  acceptCounterAction,
  withdrawOfferAction,
} from "@/app/(site)/dashboard/offers/actions";

const privateHeaders = { "Cache-Control": "private, no-store" };
const amount = z.number().int().min(1).max(100_000_000);
const id = z.string().trim().min(1).max(100);
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("make"),
    listingId: id,
    amount,
    note: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.literal("accept"), offerId: id }),
  z.object({ action: z.literal("reject"), offerId: id }),
  z.object({ action: z.literal("counter"), offerId: id, counterAmount: amount }),
  z.object({ action: z.literal("acceptCounter"), offerId: id }),
  z.object({ action: z.literal("withdraw"), offerId: id }),
]);

/** Only the current user's offers; never expose another buyer's negotiation. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { error: apiMessage(req, "سجّل دخولك لعرض العروض") },
      { status: 401, headers: privateHeaders },
    );
  const params = new URL(req.url).searchParams;
  const tab = params.get("tab") === "sent" ? "sent" : "received";
  const page = parsePage(params.get("page"));
  if (page === null)
    return NextResponse.json(
      { error: apiMessage(req, "رقم الصفحة غير صالح") },
      { status: 400, headers: privateHeaders },
    );
  const pageSize = 25;
  const listingId = params.get("listingId");
  const where = {
    ...(tab === "sent" ? { buyerId: user.id } : { listing: { sellerId: user.id } }),
    ...(listingId ? { listingId } : {}),
  };
  const [rows, total] = await Promise.all([
    db.offer.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            images: true,
            price: true,
            status: true,
            sellerId: true,
          },
        },
        buyer: { select: { id: true, name: true } },
      },
    }),
    db.offer.count({ where }),
  ]);
  return NextResponse.json(
    {
      tab,
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
      items: rows.map((row) => ({
        id: row.id,
        amount: row.amount,
        counterAmount: row.counterAmount,
        status: row.status,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        decidedAt: row.decidedAt?.toISOString() ?? null,
        buyer: row.buyer,
        listing: { ...row.listing, images: parseImages(row.listing.images) },
      })),
    },
    { headers: privateHeaders },
  );
}

/** Reuse website actions so ownership, rate limits and settlement stay identical. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { error: apiMessage(req, "سجّل دخولك لتقديم عرض") },
      { status: 401, headers: privateHeaders },
    );
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: apiMessage(req, "راجع مبلغ العرض والبيانات المطلوبة") },
      { status: 400, headers: privateHeaders },
    );
  const form = new FormData();
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key !== "action") form.set(key, String(value));
  }
  const handlers = {
    make: makeOfferAction,
    accept: acceptOfferAction,
    reject: rejectOfferAction,
    counter: counterOfferAction,
    acceptCounter: acceptCounterAction,
    withdraw: withdrawOfferAction,
  };
  const result = await handlers[parsed.data.action](form);
  return NextResponse.json(result, {
    status: "error" in result ? 409 : 200,
    headers: privateHeaders,
  });
}
