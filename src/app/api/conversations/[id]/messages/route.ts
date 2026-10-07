import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { hasUserBlock, lockChatUsers } from "@/lib/conversation-policy";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptText, encryptText } from "@/lib/crypto";
import { findBannedWord } from "@/lib/moderation";
import { notifyWithClient } from "@/lib/notify";
import { savePrivateImage, deletePrivateImage, MAX_FILE } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

async function getConvForUser(id: string, userId: string) {
  const conv = await db.conversation.findUnique({
    where: { id },
    include: { listing: true, buyer: true, seller: true },
  });
  if (!conv || (conv.buyerId !== userId && conv.sellerId !== userId)) return null;
  return conv;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitGuard(_req, "chat-read", 120, 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conv = await getConvForUser(id, session.sub);
  if (!conv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sp = new URL(_req.url).searchParams;
  const before = sp.get("before"),
    after = sp.get("after");
  if (before && after) return NextResponse.json({ error: "invalid cursor" }, { status: 400 });
  const cursor =
    before || after
      ? await db.message.findFirst({
          where: { id: (before || after)!, conversationId: id },
          select: { id: true, createdAt: true },
        })
      : null;
  if ((before || after) && !cursor)
    return NextResponse.json({ error: "invalid cursor" }, { status: 400 });
  const boundary = cursor
    ? {
        OR: [
          { createdAt: after ? { gt: cursor.createdAt } : { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: after ? { gt: cursor.id } : { lt: cursor.id } },
        ],
      }
    : {};
  const fetched = await db.message.findMany({
    where: { conversationId: id, ...boundary },
    orderBy: [{ createdAt: after ? "asc" : "desc" }, { id: after ? "asc" : "desc" }],
    take: 51,
  });
  const hasMore = fetched.length > 50;
  const messages = fetched.slice(0, 50);
  if (!after) messages.reverse();
  const receipts = await db.message.findMany({
    where: { conversationId: id, senderId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, readAt: true, deliveredAt: true },
  });

  return NextResponse.json({
    hasMoreBefore: !after && hasMore,
    hasMoreAfter: !!after && hasMore,
    receipts,
    messages: messages.map((m) => ({
      id: m.id,
      // stored encrypted — decrypted only for the two conversation parties
      body: decryptText(m.body),
      imageUrl: m.imageUrl?.startsWith("private:")
        ? `/api/conversations/${id}/messages/${m.id}/image`
        : m.imageUrl,
      mine: m.senderId === session.sub,
      at: m.createdAt.toISOString(),
      deliveredAt: m.deliveredAt?.toISOString() ?? null,
      readAt: m.readAt?.toISOString() ?? null,
    })),
  });
}

const postSchema = z.object({ body: z.string().max(2000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitGuard(req, "chat-send", 30, 60_000);
  if (limited) return limited;

  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conv = await getConvForUser(id, session.sub);
  if (!conv) return NextResponse.json({ error: "not found" }, { status: 404 });

  // accept JSON (text-only) or multipart form-data (text + image)
  let body = "";
  let imageFile: File | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return NextResponse.json({ error: apiMessage(req, "طلب غير صالح") }, { status: 400 });
    body = String(fd.get("body") ?? "").trim();
    const file = fd.get("image");
    if (file instanceof File && file.size > 0) imageFile = file;
  } else {
    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: apiMessage(req, "رسالة غير صالحة") }, { status: 400 });
    }
    body = parsed.data.body.trim();
  }

  if (!body && !imageFile) {
    return NextResponse.json(
      { error: apiMessage(req, "اكتب رسالة أو أرفق صورة") },
      { status: 400 },
    );
  }
  if (body.length > 2000) {
    return NextResponse.json(
      { error: apiMessage(req, "الرسالة أطول من الحد المسموح") },
      { status: 400 },
    );
  }

  if (body) {
    const banned = await findBannedWord(body);
    if (banned) {
      return NextResponse.json(
        { error: apiMessage(req, "رسالتك تحتوي محتوى مخالفاً لسياسات المنصة") },
        { status: 422 },
      );
    }
  }

  // Chat attachments are private and can only be read through the
  // conversation-authorized image route.
  let imageUrl: string | null = null;
  if (imageFile) {
    if (imageFile.size > MAX_FILE) {
      return NextResponse.json(
        { error: apiMessage(req, "حجم الصورة يتجاوز 5 ميجابايت") },
        { status: 400 },
      );
    }
    const saved = await savePrivateImage(imageFile, "chat");
    if (!saved.ok) {
      return NextResponse.json({ error: apiMessage(req, saved.error) }, { status: 400 });
    }
    imageUrl = `private:${saved.path}`;
  }

  let message;
  try {
    message = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${id} FOR UPDATE`;
        await lockChatUsers(tx, [conv.buyerId, conv.sellerId]);
        const fresh = await tx.conversation.findUnique({
          where: { id },
          include: { listing: true, buyer: true, seller: true },
        });
        if (
          !fresh ||
          fresh.buyer.isBanned ||
          fresh.seller.isBanned ||
          (await hasUserBlock(fresh.buyerId, fresh.sellerId, tx))
        )
          throw new Error("CHAT_FORBIDDEN");
        if (fresh.listing && fresh.listing.status !== "ACTIVE") {
          const fulfilment =
            fresh.listing.status === "SOLD" &&
            (await tx.transaction.findFirst({
              where: {
                listingId: fresh.listingId!,
                buyerId: fresh.buyerId,
                sellerId: fresh.sellerId,
                status: { in: ["PENDING", "CONFIRMED", "DISPUTED"] },
              },
              select: { id: true },
            }));
          if (!fulfilment) throw new Error("CHAT_FORBIDDEN");
        }
        const created = await tx.message.create({
          data: {
            conversationId: id,
            senderId: session.sub,
            body: body ? encryptText(body) : "",
            imageUrl,
          },
        });
        if (session.sub === fresh.sellerId && !fresh.firstSellerReplyAt) {
          const first = await tx.message.findFirst({
            where: { conversationId: id, senderId: fresh.buyerId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { createdAt: true },
          });
          await tx.conversation.update({
            where: { id },
            data: { firstSellerReplyAt: created.createdAt },
          });
          if (first)
            await tx.user.update({
              where: { id: fresh.sellerId },
              data: {
                responseMinsSum: {
                  increment: Math.min(
                    1440,
                    Math.max(
                      0,
                      Math.round(
                        (created.createdAt.getTime() - first.createdAt.getTime()) / 60_000,
                      ),
                    ),
                  ),
                },
                responseCount: { increment: 1 },
              },
            });
        }
        const recipientId = fresh.buyerId === session.sub ? fresh.sellerId : fresh.buyerId;
        const link = `/dashboard/messages/${id}`;
        const existing = await tx.notification.findFirst({
          where: { userId: recipientId, type: "MESSAGE", link, readAt: null },
          select: { id: true },
        });
        if (!existing)
          await notifyWithClient(
            tx,
            [recipientId],
            "MESSAGE",
            "رسالة جديدة",
            fresh.listing
              ? `رسالة من ${session.name} حول "${fresh.listing.title}"`
              : `رسالة من ${session.name}`,
            link,
            `chat:${id}:${created.id}`,
          );
        return created;
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    if (imageUrl) await deletePrivateImage(imageUrl.slice("private:".length));
    if (error instanceof Error && error.message === "CHAT_FORBIDDEN")
      return NextResponse.json(
        { error: apiMessage(req, "لا يمكن إرسال رسائل في هذه المحادثة") },
        { status: 403 },
      );
    throw error;
  }
  return NextResponse.json({ ok: true, id: message.id });
}
