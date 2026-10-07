import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** The user's saved-search alerts (create/delete via the existing API). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const rows = await db.savedSearch.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    items: rows.map((s) => ({
      id: s.id,
      query: s.query,
      category: s.category,
      city: s.city,
      type: s.type,
      hits: s.hits,
      lastHitAt: s.lastHitAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}
