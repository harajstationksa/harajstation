import { apiMessage } from "@/lib/api-messages";
import { parsePage } from "@/lib/pagination";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseJson } from "../../_lib/serialize";

/** Sales & purchases with their confirm/review state. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: apiMessage(req, "غير مسجل") }, { status: 401 });

  const page = parsePage(new URL(req.url).searchParams.get("page"));
  if (page === null)
    return NextResponse.json({ error: apiMessage(req, "رقم الصفحة غير صالح") }, { status: 400 });
  const total = await db.transaction.count({
    where: { OR: [{ sellerId: session.sub }, { buyerId: session.sub }] },
  });
  const txs = await db.transaction.findMany({
    where: { OR: [{ sellerId: session.sub }, { buyerId: session.sub }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
    skip: (page - 1) * 30,
    include: {
      listing: { select: { id: true, title: true, images: true } },
      seller: {
        select: { id: true, name: true, avatarUrl: true, avatarColor: true },
      },
      buyer: {
        select: { id: true, name: true, avatarUrl: true, avatarColor: true },
      },
      dispute: {
        select: {
          id: true,
          status: true,
          resolution: true,
          resolvedInFavorOf: true,
        },
      },
    },
  });

  const reviews = await db.review.findMany({
    where: {
      authorId: session.sub,
      transactionId: { in: txs.map((t) => t.id) },
    },
    select: { transactionId: true },
  });
  const reviewed = new Set(reviews.map((r) => r.transactionId));

  return NextResponse.json({
    page,
    pageSize: 30,
    total,
    hasMore: page * 30 < total,
    items: txs.map((t) => {
      const isSeller = t.sellerId === session.sub;
      return {
        id: t.id,
        role: isSeller ? "SELLER" : "BUYER",
        amount: t.amount,
        source: t.source,
        status: t.status,
        myAnswer: isSeller ? t.sellerAnswer : t.buyerAnswer,
        otherAnswer: isSeller ? t.buyerAnswer : t.sellerAnswer,
        deadline: t.deadline.toISOString(),
        extension: t.extStatus ? { status: t.extStatus, days: t.extDays, note: t.extNote } : null,
        createdAt: t.createdAt.toISOString(),
        listing: {
          id: t.listing.id,
          title: t.listing.title,
          image: parseJson<string[]>(t.listing.images, [])[0] ?? null,
        },
        other: isSeller ? t.buyer : t.seller,
        dispute: t.dispute,
        hasMyReview: reviewed.has(t.id),
      };
    }),
  });
}
