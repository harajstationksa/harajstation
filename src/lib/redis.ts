/**
 * Shared Redis handle. Configured via REDIS_URL (set on the production
 * server, absent in local dev/tests) — callers must handle the null case
 * with an in-memory fallback so dev machines need no Redis install.
 *
 * Security-critical shared state (rate limits, login-guard counters) lives
 * here so every pm2 cluster worker sees the same counters. Page/settings
 * caches deliberately stay per-process (see page-cache.ts).
 */
import Redis from "ioredis";

let client: Redis | null = null;

export function redis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!client) {
    client = new Redis(url, {
      // never queue forever if Redis is down — guards fail open instead
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
    });
    client.on("error", (e) => console.error("redis:", e.message));
  }
  return client;
}
