import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
const schema = z.object({ ids: z.array(z.string().max(100)).min(1).max(200) });
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conv = await db.conversation.findFirst({
    where: { id, OR: [{ buyerId: session.sub }, { sellerId: session.sub }] },
    select: { id: true },
  });
  if (!conv) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid messages" }, { status: 400 });
  const where = { conversationId: id, id: { in: parsed.data.ids }, senderId: { not: session.sub } };
  await db.$transaction([
    db.message.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } }),
    db.message.updateMany({
      where: { ...where, deliveredAt: null },
      data: { deliveredAt: new Date() },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
