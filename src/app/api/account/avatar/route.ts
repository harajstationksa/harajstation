import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveImages, MAX_FILE } from "@/lib/uploads";
import { rateLimitGuard } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "avatar", 10, 10 * 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: apiMessage(req, "اختر صورة") }, { status: 400 });
  }
  if (file.size > MAX_FILE) {
    return NextResponse.json({ error: apiMessage(req, "حجم الصورة يتجاوز 5MB") }, { status: 400 });
  }

  const saved = await saveImages([file], "avatars");
  if (!saved.ok) {
    return NextResponse.json({ error: apiMessage(req, saved.error) }, { status: 400 });
  }

  const url = saved.urls[0];
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    await tx.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
    if (current.avatarUrl && current.avatarUrl !== url)
      await tx.backgroundJob.create({
        data: {
          kind: "AVATAR_CLEANUP",
          payload: JSON.stringify({ url: current.avatarUrl }),
        },
      });
  });

  return NextResponse.json({ ok: true, url });
}

/** Remove custom avatar → back to the colored-initial avatar. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    await tx.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
    if (current.avatarUrl)
      await tx.backgroundJob.create({
        data: {
          kind: "AVATAR_CLEANUP",
          payload: JSON.stringify({ url: current.avatarUrl }),
        },
      });
  });
  return NextResponse.json({ ok: true });
}
