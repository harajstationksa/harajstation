import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  await db.banner
    .update({ where: { id }, data: { clicks: { increment: 1 } } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
