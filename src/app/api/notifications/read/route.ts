import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimitGuard } from "@/lib/rate-limit";
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimitGuard(request, "notification-read", 60, 60_000);
  if (limited) return limited;
  const parsed = z
    .object({ ids: z.array(z.string().min(1).max(100)).min(1).max(50) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid ids" }, { status: 400 });
  await db.notification.updateMany({
    where: { userId: session.sub, id: { in: parsed.data.ids }, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
