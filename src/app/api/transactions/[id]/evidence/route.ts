import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({ note: z.string().min(10).max(2000) });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await rateLimitGuard(req, "tx-evidence", 10, 10 * 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "اكتب إفادة لا تقل عن 10 أحرف" },
      { status: 400 }
    );
  }

  const t = await db.transaction.findUnique({
    where: { id },
    include: { dispute: true },
  });
  if (!t || !t.dispute) {
    return NextResponse.json({ error: "لا يوجد نزاع على هذه المعاملة" }, { status: 404 });
  }
  if (t.sellerId !== session.sub && t.buyerId !== session.sub) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (t.dispute.status !== "OPEN") {
    return NextResponse.json({ error: "النزاع مغلق" }, { status: 409 });
  }

  await db.evidence.create({
    data: {
      disputeId: t.dispute.id,
      userId: session.sub,
      note: parsed.data.note,
    },
  });

  return NextResponse.json({ ok: true });
}
