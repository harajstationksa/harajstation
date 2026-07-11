import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({ endpoint: z.string().url().max(1000) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  await db.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: user.id },
  });
  return NextResponse.json({ ok: true });
}
