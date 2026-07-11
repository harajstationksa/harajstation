import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { evaluateTransaction } from "@/lib/credibility";

const schema = z.object({ answer: z.enum(["YES", "NO"]) });

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
    return NextResponse.json({ error: "إجابة غير صالحة" }, { status: 400 });
  }

  const t = await db.transaction.findUnique({ where: { id } });
  if (!t) {
    return NextResponse.json({ error: "المعاملة غير موجودة" }, { status: 404 });
  }
  if (t.status !== "PENDING") {
    return NextResponse.json({ error: "المعاملة مغلقة" }, { status: 409 });
  }

  const isSeller = t.sellerId === session.sub;
  const isBuyer = t.buyerId === session.sub;
  if (!isSeller && !isBuyer) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if ((isSeller && t.sellerAnswer) || (isBuyer && t.buyerAnswer)) {
    return NextResponse.json({ error: "سبق أن أجبت على هذه المعاملة" }, { status: 409 });
  }

  await db.transaction.update({
    where: { id },
    data: isSeller
      ? { sellerAnswer: parsed.data.answer }
      : { buyerAnswer: parsed.data.answer },
  });
  await evaluateTransaction(id);

  return NextResponse.json({ ok: true });
}
