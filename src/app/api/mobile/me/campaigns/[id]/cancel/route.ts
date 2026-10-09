import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cancelOwnCampaign } from "@/lib/campaigns";
import { rateLimitGuard } from "@/lib/rate-limit";

/** Stop an active campaign early (no refund — same as the website). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitGuard(req, "campaign-cancel", 20, 60_000);
  if (limited) return limited;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: apiMessage(req, "غير مسجل") }, { status: 401 });

  const { id } = await ctx.params;
  if (!(await cancelOwnCampaign(session.sub, id))) {
    return NextResponse.json({ error: apiMessage(req, "الحملة غير نشطة") }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
