import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const schema = z.object({
  targetType: z.enum(["LISTING", "USER", "COMMENT", "MESSAGE"]),
  targetId: z.string().min(1),
  reason: z.string().min(5).max(1000),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "سجّل دخولك للإبلاغ" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "اكتب سبب البلاغ (5 أحرف على الأقل)" },
      { status: 400 }
    );
  }

  // one open report per user per target
  const dup = await db.report.findFirst({
    where: {
      reporterId: session.sub,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      status: "OPEN",
    },
  });
  if (dup) {
    return NextResponse.json({ error: "سبق أن أبلغت عن هذا المحتوى" }, { status: 409 });
  }

  await db.report.create({
    data: { reporterId: session.sub, ...parsed.data },
  });

  return NextResponse.json({ ok: true });
}
