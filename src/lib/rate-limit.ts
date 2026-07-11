import { NextResponse } from "next/server";

/**
 * In-memory sliding-window rate limiter — no external service needed.
 * Good for a single-instance deployment; swap the Map for Redis when the
 * app runs on more than one server.
 */
const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

function sweep() {
  // drop stale buckets occasionally so memory stays bounded
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, hits] of buckets) {
    if (hits.length === 0 || hits[hits.length - 1] < now - 15 * 60_000) {
      buckets.delete(k);
    }
  }
}

/** True when `key` exceeded `limit` hits within the last `windowMs`. */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  sweep();
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return true;
  }
  hits.push(now);
  buckets.set(key, hits);
  return false;
}

/** Best-effort client IP (behind Cloudflare/Nginx use the forwarded header). */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    "local"
  );
}

/**
 * Guard an API route: returns a 429 response when the caller exceeded the
 * budget, or null to continue.
 *
 *   const limited = rateLimitGuard(req, "login", 5, 60_000);
 *   if (limited) return limited;
 */
export function rateLimitGuard(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  if (isRateLimited(`${scope}:${clientIp(req)}`, limit, windowMs)) {
    return NextResponse.json(
      { error: "محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً" },
      { status: 429 }
    );
  }
  return null;
}
