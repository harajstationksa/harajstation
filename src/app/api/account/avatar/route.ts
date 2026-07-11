import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveImages, MAX_FILE } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "avatar", 10, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "اختر صورة" }, { status: 400 });
  }
  if (file.size > MAX_FILE) {
    return NextResponse.json({ error: "حجم الصورة يتجاوز 5MB" }, { status: 400 });
  }

  const saved = await saveImages([file], "avatars");
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  const url = saved.urls[0];
  await db.user.update({ where: { id: user.id }, data: { avatarUrl: url } });

  return NextResponse.json({ ok: true, url });
}

/** Remove custom avatar → back to the colored-initial avatar. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await db.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
  return NextResponse.json({ ok: true });
}
