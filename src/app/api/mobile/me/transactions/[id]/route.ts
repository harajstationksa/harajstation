import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseJson } from "../../../_lib/serialize";

/** Full transaction detail: answers, dispute, evidence, reviews. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const { id } = await ctx.params;
  const t = await db.transaction.findUnique({
    where: { id },
    include: {
      listing: { select: { id: true, title: true, images: true } },
      seller: { select: { id: true, name: true, avatarUrl: true, avatarColor: true, credibility: true } },
      buyer: { select: { id: true, name: true, avatarUrl: true, avatarColor: true, credibility: true } },
      dispute: {
        include: {
          evidences: {
            orderBy: { createdAt: "asc" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!t || (t.sellerId !== session.sub && t.buyerId !== session.sub)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const reviews = await db.review.findMany({
    where: { transactionId: t.id },
    select: { authorId: true, rating: true, comment: true, createdAt: true },
  });

  const isSeller = t.sellerId === session.sub;
  return NextResponse.json({
    id: t.id,
    role: isSeller ? "SELLER" : "BUYER",
    amount: t.amount,
    source: t.source,
    status: t.status,
    myAnswer: isSeller ? t.sellerAnswer : t.buyerAnswer,
    otherAnswer: isSeller ? t.buyerAnswer : t.sellerAnswer,
    deadline: t.deadline.toISOString(),
    createdAt: t.createdAt.toISOString(),
    listing: {
      id: t.listing.id,
      title: t.listing.title,
      image: parseJson<string[]>(t.listing.images, [])[0] ?? null,
    },
    seller: t.seller,
    buyer: t.buyer,
    dispute: t.dispute
      ? {
          id: t.dispute.id,
          status: t.dispute.status,
          resolution: t.dispute.resolution,
          resolvedInFavorOf: t.dispute.resolvedInFavorOf,
          evidences: t.dispute.evidences.map((e) => ({
            id: e.id,
            note: e.note,
            fileUrl: e.fileUrl,
            user: e.user,
            createdAt: e.createdAt.toISOString(),
          })),
        }
      : null,
    myReview: reviews.find((r) => r.authorId === session.sub) ?? null,
    otherReview: reviews.find((r) => r.authorId !== session.sub) ?? null,
  });
}
