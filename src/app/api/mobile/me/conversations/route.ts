import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";
import { parseJson } from "../../_lib/serialize";

/** Conversation inbox: counterpart, listing, last message, unread count. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const convs = await db.conversation.findMany({
    where: { OR: [{ buyerId: session.sub }, { sellerId: session.sub }] },
    include: {
      listing: { select: { id: true, title: true, images: true, status: true } },
      buyer: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
      seller: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          messages: { where: { readAt: null, senderId: { not: session.sub } } },
        },
      },
    },
  });

  const items = convs
    .map((c) => {
      const other = c.buyerId === session.sub ? c.seller : c.buyer;
      const last = c.messages[0];
      return {
        id: c.id,
        // direct profile chats carry a placeholder so older app builds that
        // expect a listing object keep parsing the inbox
        listing: c.listing
          ? {
              id: c.listing.id,
              title: c.listing.title,
              image: parseJson<string[]>(c.listing.images, [])[0] ?? null,
              status: c.listing.status,
            }
          : { id: "", title: "محادثة مباشرة", image: null, status: "ACTIVE" },
        other,
        lastMessage: last
          ? {
              body: last.imageUrl && !last.body ? "📷 صورة" : decryptText(last.body),
              senderId: last.senderId,
              createdAt: last.createdAt.toISOString(),
              readAt: last.readAt?.toISOString() ?? null,
            }
          : null,
        unread: c._count.messages,
        createdAt: c.createdAt.toISOString(),
      };
    })
    .sort((a, b) => {
      const ta = a.lastMessage?.createdAt ?? a.createdAt;
      const tb = b.lastMessage?.createdAt ?? b.createdAt;
      return tb.localeCompare(ta);
    });

  return NextResponse.json({ items });
}
