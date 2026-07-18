import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";
import { saveImages, MAX_FILE } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

/** Upload a banner image (admins only). Returns the stored URL for the form. */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "banner-image", 20, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user || !STAFF_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("image");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "اختر صورة" }, { status: 400 });
  }
  if (file.size > MAX_FILE) {
    return NextResponse.json({ error: "حجم الصورة يتجاوز 5MB" }, { status: 400 });
  }

  const saved = await saveImages([file], "banners");
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, url: saved.urls[0] });
}
