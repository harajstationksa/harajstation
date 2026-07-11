import { NextResponse } from "next/server";
import { finalizeExpiredAuctions } from "@/lib/auction";
import { finalizeExpiredCampaigns } from "@/lib/campaigns";
import { expirePendingTransactions } from "@/lib/credibility";

export const dynamic = "force-dynamic";

/**
 * Single cron entry point — runs every finalizer that otherwise fires lazily
 * on page visits (auctions, campaigns, transaction deadlines).
 *
 * Call it every minute with the secret:
 *   GET /api/cron  +  header  Authorization: Bearer <CRON_SECRET>
 *   (or ?key=<CRON_SECRET> for schedulers that can't set headers)
 *
 * Works with Vercel Cron, cPanel cron, systemd timers, UptimeRobot, or plain
 * crontab: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://site/api/cron
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }
  const url = new URL(req.url);
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("key") ??
    "";
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ran: Record<string, "ok" | string> = {};
  const jobs: [string, () => Promise<unknown>][] = [
    ["auctions", finalizeExpiredAuctions],
    ["campaigns", finalizeExpiredCampaigns],
    ["transactions", expirePendingTransactions],
  ];
  for (const [name, job] of jobs) {
    try {
      await job();
      ran[name] = "ok";
    } catch (e) {
      // one failing job must not starve the others
      ran[name] = e instanceof Error ? e.message : "failed";
    }
  }

  const failed = Object.values(ran).some((v) => v !== "ok");
  return NextResponse.json({ ok: !failed, ran }, { status: failed ? 500 : 200 });
}
