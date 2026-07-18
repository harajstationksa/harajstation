import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { rateLimitGuard } from "@/lib/rate-limit";

/** Follow a seller — new listings/auctions from them notify the follower. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ sellerId: string }> }
) {
  // followed sellers get a notification — keep the toggle un-spammable
  const limited = await rateLimitGuard(req, "follow", 20, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }
  const { sellerId } = await ctx.params;
  if (sellerId === user.id) {
    return NextResponse.json({ error: "لا يمكنك متابعة نفسك" }, { status: 400 });
  }
  const seller = await db.user.findUnique({ where: { id: sellerId } });
  if (!seller || seller.isBanned) {
    return NextResponse.json({ error: "البائع غير موجود" }, { status: 404 });
  }
  await db.follow.upsert({
    where: { followerId_sellerId: { followerId: user.id, sellerId } },
    create: { followerId: user.id, sellerId },
    update: {},
  });
  await notify(
    sellerId,
    "SYSTEM",
    "متابع جديد",
    `${user.name} يتابعك الآن — سيصله إشعار بكل إعلان أو مزاد جديد تنشره.`,
    `/profile/${user.id}`
  );
  return NextResponse.json({ ok: true, following: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ sellerId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }
  const { sellerId } = await ctx.params;
  await db.follow.deleteMany({
    where: { followerId: user.id, sellerId },
  });
  return NextResponse.json({ ok: true, following: false });
}
