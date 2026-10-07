import { apiMessage } from "@/lib/api-messages";
import { lockListing } from "@/lib/listing-policy";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimitGuard } from "@/lib/rate-limit";
import { directConversationKey, hasUserBlock, lockChatUsers } from "@/lib/conversation-policy";

const schema = z.object({
  listingId: z.string().min(1).max(100).optional(),
  buyerId: z.string().min(1).max(100).optional(),
  userId: z.string().min(1).max(100).optional(),
});
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "conv-create", 15, 10 * 60_000);
  if (limited) return limited;
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: apiMessage(req, "سجّل دخولك للمراسلة") }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.listingId && !parsed.data.userId))
    return NextResponse.json({ error: apiMessage(req, "طلب غير صالح") }, { status: 400 });
  return db.$transaction(
    async (tx) => {
      if (!parsed.data.listingId) {
        const targetId = parsed.data.userId!;
        if (targetId === session.sub)
          return NextResponse.json({ error: apiMessage(req, "طلب غير صالح") }, { status: 400 });
        const directKey = directConversationKey(session.sub, targetId);
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${"direct-chat:" + directKey}, 0))`;
        await lockChatUsers(tx, [session.sub, targetId]);
        const target = await tx.user.findUnique({ where: { id: targetId } });
        if (!target || target.isBanned)
          return NextResponse.json(
            { error: apiMessage(req, "المستخدم غير موجود") },
            { status: 404 },
          );
        if (await hasUserBlock(session.sub, targetId, tx))
          return NextResponse.json(
            { error: apiMessage(req, "المراسلة غير متاحة بين هذين الحسابين") },
            { status: 403 },
          );
        const conv = await tx.conversation.upsert({
          where: { directKey },
          create: { buyerId: session.sub, sellerId: targetId, directKey },
          update: {},
        });
        return NextResponse.json({ id: conv.id });
      }
      await lockListing(tx, parsed.data.listingId!);
      const listing = await tx.listing.findUnique({
        where: { id: parsed.data.listingId },
        include: { seller: { select: { isBanned: true } } },
      });
      if (!listing || listing.seller.isBanned)
        return NextResponse.json({ error: apiMessage(req, "الإعلان غير موجود") }, { status: 404 });
      const sellerOpening = listing.sellerId === session.sub;
      const buyerId = sellerOpening ? parsed.data.buyerId : session.sub;
      if (!buyerId || buyerId === listing.sellerId)
        return NextResponse.json(
          { error: apiMessage(req, "حدد الطرف الآخر للمحادثة") },
          { status: 400 },
        );
      await lockChatUsers(tx, [buyerId, listing.sellerId]);
      const buyer = await tx.user.findUnique({
        where: { id: buyerId },
        select: { isBanned: true },
      });
      if (!buyer || buyer.isBanned)
        return NextResponse.json({ error: apiMessage(req, "المستخدم غير موجود") }, { status: 404 });
      if (await hasUserBlock(buyerId, listing.sellerId, tx))
        return NextResponse.json(
          { error: apiMessage(req, "المراسلة غير متاحة بين هذين الحسابين") },
          { status: 403 },
        );
      const existing = await tx.conversation.findUnique({
        where: { listingId_buyerId: { listingId: listing.id, buyerId } },
      });
      const transaction = await tx.transaction.findFirst({
        where: {
          listingId: listing.id,
          buyerId,
          sellerId: listing.sellerId,
          status: { in: ["PENDING", "CONFIRMED", "DISPUTED"] },
        },
        select: { id: true },
      });
      // Preserve communication for arranging a completed sale, while hidden listings stay closed.
      if (listing.status !== "ACTIVE" && !(listing.status === "SOLD" && (existing || transaction)))
        return NextResponse.json(
          { error: apiMessage(req, "الإعلان غير متاح للمراسلة") },
          { status: 409 },
        );
      if (sellerOpening && !existing && !transaction) {
        const [bid, offer] = await Promise.all([
          tx.bid.findFirst({
            where: { bidderId: buyerId, auction: { listingId: listing.id } },
            select: { id: true },
          }),
          tx.offer.findFirst({ where: { listingId: listing.id, buyerId }, select: { id: true } }),
        ]);
        if (!bid && !offer)
          return NextResponse.json(
            { error: apiMessage(req, "لا توجد علاقة لهذا المستخدم بالإعلان") },
            { status: 403 },
          );
      }
      const conv = await tx.conversation.upsert({
        where: { listingId_buyerId: { listingId: listing.id, buyerId } },
        create: { listingId: listing.id, buyerId, sellerId: listing.sellerId },
        update: {},
      });
      return NextResponse.json({ id: conv.id });
    },
    { timeout: 15_000 },
  );
}
