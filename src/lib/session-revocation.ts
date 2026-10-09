import { redis } from "./redis";

/**
 * Logged-out session tokens. A JWT stays cryptographically valid until it
 * expires, so logout records its `jti` here until that moment; getSession()
 * and getAdminSession() refuse revoked ids. Shared through Redis across PM2
 * workers, with a per-worker fallback when Redis is unavailable.
 */
const local = new Map<string, number>(); // jti -> expiry (ms)

function sweep(now: number) {
  if (local.size < 10_000) return;
  for (const [jti, exp] of local) if (exp <= now) local.delete(jti);
}

export async function revokeSessionToken(jti: string, expiresAtSec: number): Promise<void> {
  const now = Date.now();
  const ttlMs = expiresAtSec * 1000 - now;
  if (!jti || ttlMs <= 0) return;
  sweep(now);
  local.set(jti, now + ttlMs);
  const r = redis();
  if (!r) return;
  await r.set(`revoked-session:${jti}`, "1", "PX", ttlMs).catch(() => {
    console.error("session_revocation_store_failed");
  });
}

export async function isSessionTokenRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  const exp = local.get(jti);
  if (exp && exp > Date.now()) return true;
  const r = redis();
  if (!r) return false;
  try {
    return (await r.exists(`revoked-session:${jti}`)) === 1;
  } catch {
    // Redis outage: fall back to this worker's list rather than signing everyone out.
    return false;
  }
}
