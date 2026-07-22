import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({
  listingId: z.string().min(1).optional(),
  // when the listing's seller starts the chat (e.g. with an auction winner)
  buyerId: z.string().optional(),
  // direct chat with a user (started from their profile — no listing involved)
  userId: z.string().optional(),
});

/** Find-or-create a conversation about a listing (or direct); returns its id. */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "conv-create", 15, 10 * 60_000);
  if (limited) return limited;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "سجّل دخولك للمراسلة" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.listingId && !parsed.data.userId)) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  // ── direct profile chat ──
  if (!parsed.data.listingId) {
    const targetId = parsed.data.userId!;
    if (targetId === session.sub) {
      return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
    }
    const target = await db.user.findUnique({ where: { id: targetId } });
    if (!target || target.isBanned) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    // one direct thread per pair, whichever side opened it first
    const existing = await db.conversation.findFirst({
      where: {
        listingId: null,
        OR: [
          { buyerId: session.sub, sellerId: targetId },
          { buyerId: targetId, sellerId: session.sub },
        ],
      },
    });
    if (existing) return NextResponse.json({ id: existing.id });

    const conv = await db.conversation.create({
      data: { buyerId: session.sub, sellerId: targetId },
    });
    return NextResponse.json({ id: conv.id });
  }

  const listing = await db.listing.findUnique({
    where: { id: parsed.data.listingId },
  });
  if (!listing) {
    return NextResponse.json({ error: "الإعلان غير موجود" }, { status: 404 });
  }

  let buyerId: string;
  if (listing.sellerId === session.sub) {
    if (!parsed.data.buyerId || parsed.data.buyerId === session.sub) {
      return NextResponse.json(
        { error: "حدد الطرف الآخر للمحادثة" },
        { status: 400 }
      );
    }
    buyerId = parsed.data.buyerId;
  } else {
    buyerId = session.sub;
  }

  const conv = await db.conversation.upsert({
    where: { listingId_buyerId: { listingId: listing.id, buyerId } },
    create: { listingId: listing.id, buyerId, sellerId: listing.sellerId },
    update: {},
  });

  return NextResponse.json({ id: conv.id });
}
