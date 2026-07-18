import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { findBannedWord } from "@/lib/moderation";
import { notify } from "@/lib/notify";
import { isRateLimited, rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({ body: z.string().min(2).max(1000) });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await rateLimitGuard(req, "comment", 6, 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "سجّل دخولك للتعليق" }, { status: 401 });
  }
  // per-account budget too — comments notify sellers, so IP-hopping must not help
  if (await isRateLimited(`comment:u:${session.sub}`, 30, 60 * 60_000)) {
    return NextResponse.json(
      { error: "تجاوزت حد التعليقات مؤقتاً — حاول لاحقاً" },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "تعليق غير صالح" }, { status: 400 });
  }

  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing || listing.status === "REMOVED") {
    return NextResponse.json({ error: "الإعلان غير موجود" }, { status: 404 });
  }

  const banned = await findBannedWord(parsed.data.body);
  if (banned) {
    return NextResponse.json(
      { error: "تعليقك يحتوي محتوى مخالفاً لسياسات المنصة" },
      { status: 422 }
    );
  }

  await db.comment.create({
    data: { listingId: id, userId: session.sub, body: parsed.data.body },
  });

  if (listing.sellerId !== session.sub) {
    await notify(
      listing.sellerId,
      "MESSAGE",
      "استفسار جديد على إعلانك",
      `علّق ${session.name} على "${listing.title}": ${parsed.data.body.slice(0, 80)}`,
      `/listings/${id}`
    );
  }

  return NextResponse.json({ ok: true });
}
