import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPlanLimits } from "@/lib/limits";
import { findBannedWord } from "@/lib/moderation";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({
  storeId: z.string().optional(), // present = edit; absent = create
  name: z.string().min(3).max(50),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{3,30}$/, "معرف المتجر: أحرف إنجليزية صغيرة وأرقام وشرطات فقط"),
  description: z.string().max(500).optional().or(z.literal("")),
});

/** Create a new store (within plan limit) or edit an existing one. */
export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "store-write", 10, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 }
    );
  }
  const { storeId, name, slug } = parsed.data;
  const description = parsed.data.description || "";

  const banned = await findBannedWord(`${name} ${description}`);
  if (banned) {
    return NextResponse.json({ error: "محتوى المتجر يخالف سياسات المنصة" }, { status: 422 });
  }

  // slug must be globally unique
  const slugTaken = await db.store.findFirst({
    where: { slug, ...(storeId ? { id: { not: storeId } } : {}) },
  });
  if (slugTaken) {
    return NextResponse.json({ error: "معرف المتجر محجوز" }, { status: 409 });
  }

  if (storeId) {
    // edit — must own it
    const existing = await db.store.findUnique({ where: { id: storeId } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    const store = await db.store.update({
      where: { id: storeId },
      data: { name, slug, description },
    });
    return NextResponse.json({ ok: true, slug: store.slug });
  }

  // create — enforce plan store limit
  const [count, limits] = await Promise.all([
    db.store.count({ where: { userId: user.id } }),
    getPlanLimits(user.isPro),
  ]);
  if (count >= limits.maxStores) {
    return NextResponse.json(
      { error: `وصلت للحد الأقصى (${limits.maxStores} متجر) لخطتك — رقِّ حسابك لإضافة المزيد` },
      { status: 403 }
    );
  }

  const store = await db.store.create({
    data: { userId: user.id, name, slug, description },
  });
  return NextResponse.json({ ok: true, slug: store.slug });
}

/** Delete one of the user's stores. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "لا يوجد متجر" }, { status: 400 });
  const store = await db.store.findUnique({ where: { id } });
  if (!store || store.userId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  await db.store.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
