import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { privateImageResponse } from "@/lib/private-storage";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; messageId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, messageId } = await ctx.params;
  const message = await db.message.findFirst({
    where: { id: messageId, conversationId: id },
    include: { conversation: { select: { buyerId: true, sellerId: true } } },
  });
  if (
    !message ||
    (message.conversation.buyerId !== session.sub && message.conversation.sellerId !== session.sub)
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!message.imageUrl?.startsWith("private:")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return privateImageResponse(message.imageUrl.slice("private:".length));
}
