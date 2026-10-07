import { cleanOrphanPrivateImages } from "@/lib/private-storage";
import { db } from "@/lib/db";
import { processBackgroundJobs } from "@/lib/background-jobs";
import { expireFeaturedListings } from "@/lib/listing-policy";
import { NextResponse } from "next/server";
import { finalizeExpiredAuctions } from "@/lib/auction";
import { finalizeExpiredCampaigns } from "@/lib/campaigns";
import { expirePendingTransactions } from "@/lib/credibility";
import { expireProMemberships } from "@/lib/limits";
import { nudgePriceDrops } from "@/lib/nudges";
import { safeEqual } from "@/lib/crypto";
import { withOperationalLease } from "@/lib/operational-lease";

export const dynamic = "force-dynamic";

/**
 * Single cron entry point — runs every finalizer that otherwise fires lazily
 * on page visits (auctions, campaigns, transaction deadlines).
 *
 * Call it every minute with the secret:
 *   GET /api/cron  +  header  Authorization: Bearer <CRON_SECRET>
 * (Header only — a ?key= query param would end up in access logs.)
 *
 * Works with Vercel Cron, cPanel cron, systemd timers, UptimeRobot, or plain
 * crontab: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://site/api/cron
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const response = await withOperationalLease("cron", async (assertOwned) => {
    const ran: Record<string, "ok" | string> = {};
    const jobs: [string, () => Promise<unknown>][] = [
      ["featuredListings", expireFeaturedListings],
      ["auctions", finalizeExpiredAuctions],
      ["campaigns", finalizeExpiredCampaigns],
      ["transactions", expirePendingTransactions],
      ["proMemberships", expireProMemberships],
      ["priceNudges", nudgePriceDrops],
      ["backgroundJobs", processBackgroundJobs],
      ["privateUploads", cleanOrphanPrivateImages],
    ];
    for (const [name, job] of jobs) {
      assertOwned();
      try {
        await job();
        ran[name] = "ok";
        await db.operationalCheck
          .upsert({
            where: { key: name },
            create: { key: name, lastSuccessAt: new Date() },
            update: { lastSuccessAt: new Date() },
          })
          .catch(() => {
            console.error("cron_telemetry_failed", { job: name });
          });
      } catch (e) {
        // one failing job must not starve the others
        ran[name] = "failed";
        console.error("cron_job_failed", {
          job: name,
          code: (e as { code?: string })?.code ?? "JOB_FAILED",
        });
        await db.operationalCheck
          .upsert({
            where: { key: name },
            create: { key: name, lastFailureAt: new Date() },
            update: { lastFailureAt: new Date() },
          })
          .catch(() => {
            console.error("cron_telemetry_failed", { job: name });
          });
      }
    }

    const failed = Object.values(ran).some((v) => v !== "ok");
    return NextResponse.json({ ok: !failed, ran }, { status: failed ? 500 : 200 });
  });
  return response ?? NextResponse.json({ ok: true, skipped: "already_running" });
}
