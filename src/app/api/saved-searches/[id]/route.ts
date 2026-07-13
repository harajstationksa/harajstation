import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitGuard } from "@/lib/rate-limit";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = rateLimitGuard(req, "saved-search-del", 30, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const search = await db.savedSearch.findUnique({ where: { id } });
  if (!search || search.userId !== user.id) {
    return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  }
  await db.savedSearch.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
