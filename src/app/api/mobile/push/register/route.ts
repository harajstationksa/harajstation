import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitGuard } from "@/lib/rate-limit";

const MAX_DEVICES = 10;
const schema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(["ANDROID", "IOS"]).default("ANDROID"),
});
const removeSchema = z.object({ token: z.string().min(20).max(4096) });

/**
 * Register this installed app for native push (FCM). A token belongs to one
 * device, so signing in with another account on the same phone moves it.
 */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "fcm-register", 20, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: apiMessage(req, "سجّل دخولك أولاً") }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: apiMessage(req, "طلب غير صالح") }, { status: 400 });
  const { token, platform } = parsed.data;

  await db.$transaction(async (tx) => {
    await tx.deviceToken.upsert({
      where: { token },
      create: { userId: user.id, token, platform },
      update: { userId: user.id, platform },
    });
    // keep the newest devices only — an abandoned phone stops receiving
    const stale = await tx.deviceToken.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      skip: MAX_DEVICES,
      select: { id: true },
    });
    if (stale.length)
      await tx.deviceToken.deleteMany({ where: { id: { in: stale.map((d) => d.id) } } });
  });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Called right before sign-out so the phone stops receiving this account's pushes. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: apiMessage(req, "سجّل دخولك أولاً") }, { status: 401 });
  const parsed = removeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: apiMessage(req, "طلب غير صالح") }, { status: 400 });
  await db.deviceToken.deleteMany({ where: { token: parsed.data.token, userId: user.id } });
  return NextResponse.json({ ok: true });
}
