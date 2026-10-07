import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { lockChatUsers } from "@/lib/conversation-policy";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimitGuard } from "@/lib/rate-limit";
const schema = z.object({ userId: z.string().min(1).max(100) });
async function change(req: Request, block: boolean) {
  const limited = await rateLimitGuard(req, "user-block", 20, 60_000);
  if (limited) return limited;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.userId === session.sub)
    return NextResponse.json({ error: apiMessage(req, "طلب غير صالح") }, { status: 400 });
  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true },
  });
  if (!target)
    return NextResponse.json({ error: apiMessage(req, "المستخدم غير موجود") }, { status: 404 });
  const pair = { blockerId: session.sub, blockedId: target.id };
  await db.$transaction(async (tx) => {
    await lockChatUsers(tx, [session.sub, target.id]);
    if (block)
      await tx.userBlock.upsert({ where: { blockerId_blockedId: pair }, create: pair, update: {} });
    else await tx.userBlock.deleteMany({ where: pair });
  });
  return NextResponse.json({ ok: true, blocked: block });
}
export function POST(req: Request) {
  return change(req, true);
}
export function DELETE(req: Request) {
  return change(req, false);
}
