import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const schema = z.object({
  listingId: z.string().min(1),
  // when the listing's seller starts the chat (e.g. with an auction winner)
  buyerId: z.string().optional(),
});

/** Find-or-create a conversation about a listing; returns its id. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "سجّل دخولك للمراسلة" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
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
