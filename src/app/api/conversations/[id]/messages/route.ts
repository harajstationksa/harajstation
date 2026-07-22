import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptText, encryptText } from "@/lib/crypto";
import { findBannedWord } from "@/lib/moderation";
import { notify } from "@/lib/notify";
import { saveImages, MAX_FILE } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

async function getConvForUser(id: string, userId: string) {
  const conv = await db.conversation.findUnique({
    where: { id },
    include: { listing: true, buyer: true, seller: true },
  });
  if (!conv || (conv.buyerId !== userId && conv.sellerId !== userId)) return null;
  return conv;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conv = await getConvForUser(id, session.sub);
  if (!conv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const messages = await db.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // Reading the thread implies delivery too — someone can open a conversation
  // straight from a link without a page view having marked it delivered first,
  // and a message that is read but not delivered would be nonsense. Separate
  // updates so an existing deliveredAt keeps the time it actually arrived.
  const now = new Date();
  const fromThem = { conversationId: id, senderId: { not: session.sub } };
  await Promise.all([
    db.message.updateMany({
      where: { ...fromThem, readAt: null },
      data: { readAt: now },
    }),
    db.message.updateMany({
      where: { ...fromThem, deliveredAt: null },
      data: { deliveredAt: now },
    }),
  ]);

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      // stored encrypted — decrypted only for the two conversation parties
      body: decryptText(m.body),
      imageUrl: m.imageUrl,
      mine: m.senderId === session.sub,
      at: m.createdAt.toISOString(),
      deliveredAt: m.deliveredAt?.toISOString() ?? null,
      readAt: m.readAt?.toISOString() ?? null,
    })),
  });
}

const postSchema = z.object({ body: z.string().max(2000) });

/** Add (delay until first seller reply, in minutes) to the seller's stats. */
async function recordSellerFirstReply(
  conversationId: string,
  sellerId: string,
  sentMessageId: string
) {
  const sellerMsgCount = await db.message.count({
    where: { conversationId, senderId: sellerId },
  });
  if (sellerMsgCount !== 1) return; // not their first reply here

  const firstFromBuyer = await db.message.findFirst({
    where: { conversationId, senderId: { not: sellerId }, id: { not: sentMessageId } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (!firstFromBuyer) return; // seller wrote first — nothing was awaited

  const mins = Math.min(
    1440,
    Math.max(0, Math.round((Date.now() - firstFromBuyer.createdAt.getTime()) / 60_000))
  );
  await db.user.update({
    where: { id: sellerId },
    data: { responseMinsSum: { increment: mins }, responseCount: { increment: 1 } },
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
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
    if (!fd) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
    body = String(fd.get("body") ?? "").trim();
    const file = fd.get("image");
    if (file instanceof File && file.size > 0) imageFile = file;
  } else {
    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "رسالة غير صالحة" }, { status: 400 });
    }
    body = parsed.data.body.trim();
  }

  if (!body && !imageFile) {
    return NextResponse.json({ error: "اكتب رسالة أو أرفق صورة" }, { status: 400 });
  }
  if (body.length > 2000) {
    return NextResponse.json({ error: "الرسالة أطول من الحد المسموح" }, { status: 400 });
  }

  if (body) {
    const banned = await findBannedWord(body);
    if (banned) {
      return NextResponse.json(
        { error: "رسالتك تحتوي محتوى مخالفاً لسياسات المنصة" },
        { status: 422 }
      );
    }
  }

  // image upload (chat attachments live under uploads/chat)
  let imageUrl: string | null = null;
  if (imageFile) {
    if (imageFile.size > MAX_FILE) {
      return NextResponse.json(
        { error: "حجم الصورة يتجاوز 5 ميجابايت" },
        { status: 400 }
      );
    }
    const saved = await saveImages([imageFile], "chat");
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 400 });
    }
    imageUrl = saved.urls[0];
  }

  const message = await db.message.create({
    data: {
      conversationId: id,
      senderId: session.sub,
      // encrypted at rest — a DB leak exposes no chat content
      body: body ? encryptText(body) : "",
      imageUrl,
    },
  });

  // seller responsiveness: on the seller's FIRST message in this conversation,
  // record how long the buyer waited — this feeds the «يرد بسرعة» badge.
  // Capped at 24h so one ignored thread doesn't poison the average forever.
  if (session.sub === conv.sellerId) {
    recordSellerFirstReply(id, conv.sellerId, message.id).catch(() => {});
  }

  // notify the counterpart (throttled: skip if an unread chat notification exists)
  const recipientId = conv.buyerId === session.sub ? conv.sellerId : conv.buyerId;
  const link = `/dashboard/messages/${id}`;
  const existing = await db.notification.findFirst({
    where: { userId: recipientId, type: "MESSAGE", link, readAt: null },
  });
  if (!existing) {
    await notify(
      recipientId,
      "MESSAGE",
      "رسالة جديدة",
      conv.listing
        ? `رسالة من ${session.name} حول "${conv.listing.title}"`
        : `رسالة من ${session.name}`,
      link
    );
  }

  return NextResponse.json({ ok: true, id: message.id });
}
