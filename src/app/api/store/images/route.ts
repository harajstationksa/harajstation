import { queuePublicImageCleanup } from "@/lib/public-image-cleanup";
import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveImages, deleteImages, MAX_FILE } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

const KINDS = new Set(["logo", "banner"]);

/** Upload a store logo or banner (owner only). */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "store-image", 15, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fd = await req.formData().catch(() => null);
  const storeId = String(fd?.get("storeId") ?? "");
  const kind = String(fd?.get("kind") ?? "");
  const file = fd?.get("image");

  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: apiMessage(req, "نوع صورة غير معروف") }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: apiMessage(req, "اختر صورة") }, { status: 400 });
  }
  if (file.size > MAX_FILE) {
    return NextResponse.json({ error: apiMessage(req, "حجم الصورة يتجاوز 5MB") }, { status: 400 });
  }

  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store || store.userId !== user.id) {
    return NextResponse.json({ error: apiMessage(req, "غير مصرح") }, { status: 403 });
  }

  const saved = await saveImages([file], "stores");
  if (!saved.ok) {
    return NextResponse.json({ error: apiMessage(req, saved.error) }, { status: 400 });
  }
  const url = saved.urls[0];

  try {
    const oldUrl = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${store.id} FOR UPDATE`;
      const current = await tx.store.findUniqueOrThrow({ where: { id: store.id } });
      if (current.userId !== user.id) throw new Error("STORE_OWNER_CHANGED");
      await tx.store.update({
        where: { id: store.id },
        data: kind === "logo" ? { logoUrl: url } : { bannerUrl: url },
      });
      await queuePublicImageCleanup(tx, [kind === "logo" ? current.logoUrl : current.bannerUrl]);
      return kind === "logo" ? current.logoUrl : current.bannerUrl;
    });
    if (oldUrl) await deleteImages([oldUrl]);
  } catch (error) {
    await deleteImages([url]);
    throw error;
  }

  return NextResponse.json({ ok: true, url });
}

/** Remove a store logo or banner (owner only). ?id=<storeId>&kind=logo|banner */
export async function DELETE(req: Request) {
  const limited = await rateLimitGuard(req, "store-image-delete", 10, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const storeId = url.searchParams.get("id") ?? "";
  const kind = url.searchParams.get("kind") ?? "";
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: apiMessage(req, "نوع صورة غير معروف") }, { status: 400 });
  }
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store || store.userId !== user.id) {
    return NextResponse.json({ error: apiMessage(req, "غير مصرح") }, { status: 403 });
  }
  const oldUrl = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${store.id} FOR UPDATE`;
    const current = await tx.store.findUniqueOrThrow({ where: { id: store.id } });
    await tx.store.update({
      where: { id: store.id },
      data: kind === "logo" ? { logoUrl: null } : { bannerUrl: null },
    });
    await queuePublicImageCleanup(tx, [kind === "logo" ? current.logoUrl : current.bannerUrl]);
    return kind === "logo" ? current.logoUrl : current.bannerUrl;
  });
  if (oldUrl) await deleteImages([oldUrl]);
  return NextResponse.json({ ok: true });
}
