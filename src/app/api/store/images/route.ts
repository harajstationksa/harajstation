import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveImages, MAX_FILE } from "@/lib/uploads";
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
    return NextResponse.json({ error: "نوع صورة غير معروف" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "اختر صورة" }, { status: 400 });
  }
  if (file.size > MAX_FILE) {
    return NextResponse.json({ error: "حجم الصورة يتجاوز 5MB" }, { status: 400 });
  }

  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store || store.userId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const saved = await saveImages([file], "stores");
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }
  const url = saved.urls[0];

  await db.store.update({
    where: { id: store.id },
    data: kind === "logo" ? { logoUrl: url } : { bannerUrl: url },
  });

  return NextResponse.json({ ok: true, url });
}

/** Remove a store logo or banner (owner only). ?id=<storeId>&kind=logo|banner */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const storeId = url.searchParams.get("id") ?? "";
  const kind = url.searchParams.get("kind") ?? "";
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "نوع صورة غير معروف" }, { status: 400 });
  }
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store || store.userId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  await db.store.update({
    where: { id: store.id },
    data: kind === "logo" ? { logoUrl: null } : { bannerUrl: null },
  });
  return NextResponse.json({ ok: true });
}
