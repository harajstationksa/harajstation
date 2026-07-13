import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitGuard } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  // banner click counter — don't let a script inflate advertiser numbers
  const limited = rateLimitGuard(req, "showcase-open", 30, 10 * 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  await db.banner
    .update({ where: { id }, data: { clicks: { increment: 1 } } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
