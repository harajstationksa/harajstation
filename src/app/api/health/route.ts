import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Uptime probe for external monitoring (UptimeRobot / Cloudflare health
 * checks). Answers 200 only when the app AND the database respond; DB
 * latency is included so slow-degradation shows up before an outage does.
 */
export async function GET() {
  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      dbMs: Date.now() - t0,
      uptimeSec: Math.round(process.uptime()),
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
