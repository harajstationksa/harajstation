import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Notification feed, newest first. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = 30;

  const [total, rows] = await Promise.all([
    db.notification.count({ where: { userId: session.sub } }),
    db.notification.findMany({
      where: { userId: session.sub },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    items: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    page,
    total,
    hasMore: page * pageSize < total,
  });
}

const schema = z.object({ ids: z.array(z.string()).optional() });

/** Mark notifications as read — specific ids, or all when omitted. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const ids = parsed.success ? parsed.data.ids : undefined;

  await db.notification.updateMany({
    where: {
      userId: session.sub,
      readAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
