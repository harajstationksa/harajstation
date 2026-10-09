import { apiMessage } from "@/lib/api-messages";
import { isAllowedPushEndpoint } from "@/lib/push-policy";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({
  endpoint: z.string().url().max(1000).refine(isAllowedPushEndpoint),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(100),
  }),
});

/** Register (or re-register) this browser for Web Push. */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "push-sub", 10, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: apiMessage(req, "سجّل دخولك أولاً") }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: apiMessage(req, "اشتراك غير صالح") }, { status: 400 });
  }
  const { endpoint, keys } = parsed.data;
  if (
    (await db.pushSubscription.count({
      where: { userId: user.id, endpoint: { not: endpoint } },
    })) >= 10
  )
    return NextResponse.json(
      { error: apiMessage(req, "وصلت الحد الأقصى للأجهزة") },
      { status: 409 },
    );
  // An endpoint only moves to another account when the caller also holds its
  // keys (same browser, new sign-in); knowing a URL alone never redirects pushes.
  const existing = await db.pushSubscription.findUnique({ where: { endpoint } });
  if (existing && existing.userId !== user.id && existing.auth !== keys.auth)
    return NextResponse.json({ error: apiMessage(req, "اشتراك غير صالح") }, { status: 400 });
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
  });
  return NextResponse.json({ ok: true });
}
