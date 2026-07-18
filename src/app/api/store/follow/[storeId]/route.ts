import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { rateLimitGuard } from "@/lib/rate-limit";

/** Follow a store — new listings/auctions published under it notify the follower. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ storeId: string }> }
) {
  // the store owner gets a notification — keep the toggle un-spammable
  const limited = await rateLimitGuard(req, "store-follow", 20, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }
  const { storeId } = await ctx.params;
  const store = await db.store.findUnique({
    where: { id: storeId },
    include: { user: { select: { id: true, isBanned: true } } },
  });
  if (!store || store.user.isBanned) {
    return NextResponse.json({ error: "المتجر غير موجود" }, { status: 404 });
  }
  if (store.userId === user.id) {
    return NextResponse.json({ error: "لا يمكنك متابعة متجرك" }, { status: 400 });
  }
  await db.storeFollow.upsert({
    where: { storeId_userId: { storeId, userId: user.id } },
    create: { storeId, userId: user.id },
    update: {},
  });
  await notify(
    store.userId,
    "SYSTEM",
    "متابع جديد لمتجرك",
    `${user.name} يتابع «${store.name}» الآن — سيصله إشعار بكل إعلان أو مزاد جديد في المتجر.`,
    `/store/${store.slug}`
  );
  return NextResponse.json({ ok: true, following: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ storeId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }
  const { storeId } = await ctx.params;
  await db.storeFollow.deleteMany({
    where: { storeId, userId: user.id },
  });
  return NextResponse.json({ ok: true, following: false });
}
