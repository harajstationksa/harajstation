import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Stop an active campaign early (no refund — same as the website). */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const { id } = await ctx.params;
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign || campaign.ownerId !== session.sub) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (campaign.status !== "ACTIVE") {
    return NextResponse.json({ error: "الحملة غير نشطة" }, { status: 400 });
  }

  await db.$transaction([
    db.campaign.update({
      where: { id },
      data: { status: "CANCELLED", endedAt: new Date() },
    }),
    db.listing.update({
      where: { id: campaign.listingId },
      data: { isPromoted: false, promotedUntil: null },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
