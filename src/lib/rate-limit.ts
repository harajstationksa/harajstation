import { NextResponse } from "next/server";

/**
 * In-memory sliding-window rate limiter — no external service needed.
 * Good for a single-instance deployment; swap the Map for Redis when the
 * app runs on more than one server.
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

/** True when `key` exceeded `limit` hits within the last `windowMs`. */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
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
    return tooManyRequests(windowMs);
  }
  return null;
}
