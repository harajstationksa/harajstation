import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { privateUploadPath } from "@/lib/uploads";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; messageId: string }> }
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
    (message.conversation.buyerId !== session.sub &&
      message.conversation.sellerId !== session.sub)
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!message.imageUrl?.startsWith("private:")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const full = privateUploadPath(message.imageUrl.slice("private:".length));
  if (!full) return NextResponse.json({ error: "bad path" }, { status: 400 });
  try {
    const image = await readFile(full);
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
