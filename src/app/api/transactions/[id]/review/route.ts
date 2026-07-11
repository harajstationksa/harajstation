import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notify";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().or(z.literal("")),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "تقييم غير صالح" }, { status: 400 });
  }

  const t = await db.transaction.findUnique({
    where: { id },
    include: { listing: true },
  });
  if (!t) {
    return NextResponse.json({ error: "المعاملة غير موجودة" }, { status: 404 });
  }
  if (t.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "التقييم متاح فقط بعد تأكيد المعاملة من الطرفين" },
      { status: 409 }
    );
  }
  const isParty = t.sellerId === session.sub || t.buyerId === session.sub;
  if (!isParty) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const targetId = t.sellerId === session.sub ? t.buyerId : t.sellerId;

  const existing = await db.review.findUnique({
    where: { transactionId_authorId: { transactionId: id, authorId: session.sub } },
  });
  if (existing) {
    return NextResponse.json({ error: "سبق أن قيّمت هذه المعاملة" }, { status: 409 });
  }

  await db.review.create({
    data: {
      transactionId: id,
      authorId: session.sub,
      targetId,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
    },
  });

  await notify(
    targetId,
    "SYSTEM",
    "تقييم جديد",
    `قيّمك ${session.name} بعد معاملة "${t.listing.title}" بـ${parsed.data.rating} نجوم.`,
    `/profile/${targetId}`
  );

  return NextResponse.json({ ok: true });
}
