import { operationsHealth } from "@/lib/operations-health";
import { safeEqual } from "@/lib/crypto";
import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !safeEqual(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "", secret)
  )
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { checks, lastError, ...result } = await operationsHealth();
  void checks;
  void lastError;
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
