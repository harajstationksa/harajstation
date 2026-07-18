import { NextResponse } from "next/server";
import { redis } from "./redis";

/**
 * Sliding-window rate limiter.
 *
 * Backend: Redis (ZSET per key) when REDIS_URL is set — shared across pm2
 * cluster workers — otherwise the original in-process Map, which is exactly
 * right for single-instance deployments and local dev. Semantics are the
 * same in both: hits inside the window count toward the limit, and BLOCKED
 * calls do not add hits (being throttled never extends the throttle).
 *
 * Redis failures fail open (allow) — availability beats strictness, and the
 * in-memory limiter after a restart made the same trade.
 */
type Bucket = { hits: number[]; windowMs: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep() {
  // drop stale buckets occasionally so memory stays bounded — a bucket only
  // dies once its newest hit falls outside its OWN window, otherwise daily
  // budgets would silently reset after a few idle minutes
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.hits.length === 0 || b.hits[b.hits.length - 1] <= now - b.windowMs) {
      buckets.delete(key);
    }
  }
}

function memoryLimited(key: string, limit: number, windowMs: number): boolean {
  sweep();
  const now = Date.now();
  const hits = (buckets.get(key)?.hits ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= limit) {
    buckets.set(key, { hits, windowMs });
    return true;
  }
  hits.push(now);
  buckets.set(key, { hits, windowMs });
  return false;
}

async function redisLimited(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const r = redis();
  if (!r) return memoryLimited(key, limit, windowMs);
  const now = Date.now();
  const k = `rl:${key}`;
  try {
    await r.zremrangebyscore(k, 0, now - windowMs);
    const count = await r.zcard(k);
    if (count >= limit) return true;
    await r
      .multi()
      .zadd(k, now, `${now}-${Math.random()}`)
      .pexpire(k, windowMs)
      .exec();
    return false;
  } catch {
    return false; // fail open — error already logged by the client
  }
}

/** True when `key` exceeded `limit` hits within the last `windowMs`. */
export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  return redisLimited(key, limit, windowMs);
}

function header(h: Headers, name: string): string | null {
  const v = h.get(name)?.trim();
  return v ? v : null; // an empty header is the same as no header
}

/**
 * Best-effort client IP.
 *
 * SECURITY: these headers are only trustworthy because the reverse proxy in
 * front of the app overwrites them on every request — see deploy/nginx. If it
 * ever forwards a client-supplied value instead, every limit here becomes
 * bypassable by sending a random IP header.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const forwarded = header(h, "x-forwarded-for")?.split(",")[0].trim();
  return (
    header(h, "cf-connecting-ip") ??
    header(h, "x-real-ip") ??
    (forwarded || null) ??
    "local"
  );
}

/** Standard 429 with a Retry-After hint. */
export function tooManyRequests(
  windowMs: number,
  message = "محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً"
): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) },
    }
  );
}

/**
 * Guard an API route: returns a 429 response when the caller exceeded the
 * budget, or null to continue.
 *
 *   const limited = await rateLimitGuard(req, "login", 5, 60_000);
 *   if (limited) return limited;
 */
export async function rateLimitGuard(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number
): Promise<NextResponse | null> {
  if (await isRateLimited(`${scope}:${clientIp(req)}`, limit, windowMs)) {
    return tooManyRequests(windowMs);
  }
  return null;
}
