/**
 * Brute-force guard for password login.
 *
 * Consecutive wrong passwords escalate from the plain error into playful
 * Saudi-dialect nudges toward «نسيت كلمة المرور», and finally a temporary
 * lockout. Real accounts keep their counter on the User row (survives
 * restarts); unknown identifiers get an in-memory counter with the exact
 * same responses, so an attacker can't tell which accounts exist.
 */

import { createHash } from "node:crypto";
import { redis } from "./redis";

export const LOCK_AFTER = 8; // wrong attempts before the door closes
export const LOCK_MINUTES = 15;
export const FAIL_WINDOW_MS = 30 * 60_000; // stale counters restart after this

/* ── email-2FA one-time codes ── */

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const OTP_MAX_ATTEMPTS = 5;

/** The stored form of a login code — salted by its own challenge token. */
export function hashOtp(code: string, challenge: string): string {
  return createHash("sha256").update(`otp|${challenge}|${code}`).digest("hex");
}

/** attempt № → playful escalation (3..7); 1–2 stay the plain error */
const TEASE: Record<number, string> = {
  3: "ثلاث مرات ورا بعض؟ 🙈 تراك ناسي الباسورد يا صاحبي — اضغط «نسيت كلمة المرور» وريّح راسك",
  4: "لا والله ما هي ذي بعد 😅 خذ لك رشفة قهوة وتذكّر على روقان",
  5: "يا بعد حيّي، الباسورد عناد مو راضي يطلع 🤭 وش رايك تغيّره بضغطة زر وتفكّنا؟",
  6: "ما شاء الله على الإصرار، همّة تقطع جبال 😂 بس صدقني «نسيت كلمة المرور» أسرع لك",
  7: "آخر محاولة وبعدها نقفل الباب شوي 🚪 إذا ناسيها من جد لا تكابر — غيّرها أحسن لك",
};

export type FailVerdict = {
  error: string;
  /** show the reset-password shortcut prominently */
  suggestReset: boolean;
  /** set when this attempt triggered (or hit) a lockout */
  lockedUntil: Date | null;
};

/** Message for the n-th consecutive failure (n ≥ 1). */
export function teaseFor(count: number): { error: string; suggestReset: boolean } {
  if (count < 3) return { error: "بيانات الدخول غير صحيحة", suggestReset: false };
  return { error: TEASE[count] ?? TEASE[7], suggestReset: true };
}

/** Message while the lock is active. */
export function lockedError(lockUntil: Date): string {
  const mins = Math.max(1, Math.ceil((lockUntil.getTime() - Date.now()) / 60_000));
  return `الباب مقفول حالياً 🔒 باقي ${mins} دقيقة — أو غيّر كلمة المرور من «نسيت كلمة المرور» وادخل على طول`;
}

/** Message the moment the lock engages. */
export function lockNowError(): string {
  return `يا بطل وقّف تخمين 🛑 قفلنا الدخول ${LOCK_MINUTES} دقيقة لحماية حسابك — ارجع بعدها، أو الأفضل غيّر كلمة المرور من «نسيت كلمة المرور»`;
}

/* ── failure counter for identifiers that don't match any account ──
   Redis-backed when REDIS_URL is set (shared across cluster workers, same as
   rate-limit.ts), in-process Map otherwise. Responses stay byte-identical to
   the real-account path, so account existence never leaks. */

type GhostEntry = { count: number; lastAt: number; lockUntil: number };
const ghosts = new Map<string, GhostEntry>();

function sweepGhosts() {
  const now = Date.now();
  for (const [k, g] of ghosts) {
    if (now - g.lastAt > FAIL_WINDOW_MS && g.lockUntil < now) ghosts.delete(k);
  }
}

/** Active lock for an unknown identifier, if any. */
export async function ghostLock(key: string): Promise<Date | null> {
  const r = redis();
  if (r) {
    try {
      const ttl = await r.pttl(`ghost:lock:${key}`);
      return ttl > 0 ? new Date(Date.now() + ttl) : null;
    } catch {
      return null; // fail open, same as rate-limit.ts
    }
  }
  const g = ghosts.get(key);
  return g && g.lockUntil > Date.now() ? new Date(g.lockUntil) : null;
}

/** Register a failure for an unknown identifier; returns the verdict. */
export async function ghostFailure(key: string): Promise<FailVerdict> {
  const now = Date.now();
  const r = redis();
  if (r) {
    try {
      const k = `ghost:fail:${key}`;
      const count = await r.incr(k);
      await r.pexpire(k, FAIL_WINDOW_MS);
      if (count >= LOCK_AFTER) {
        await r
          .multi()
          .set(`ghost:lock:${key}`, "1", "PX", LOCK_MINUTES * 60_000)
          .del(k)
          .exec();
        return {
          error: lockNowError(),
          suggestReset: true,
          lockedUntil: new Date(now + LOCK_MINUTES * 60_000),
        };
      }
      return { ...teaseFor(count), lockedUntil: null };
    } catch {
      return { ...teaseFor(1), lockedUntil: null }; // fail open
    }
  }
  sweepGhosts();
  const prev = ghosts.get(key);
  const stale = !prev || now - prev.lastAt > FAIL_WINDOW_MS;
  const count = stale ? 1 : prev.count + 1;
  if (count >= LOCK_AFTER) {
    ghosts.set(key, { count: 0, lastAt: now, lockUntil: now + LOCK_MINUTES * 60_000 });
    return { error: lockNowError(), suggestReset: true, lockedUntil: new Date(now + LOCK_MINUTES * 60_000) };
  }
  ghosts.set(key, { count, lastAt: now, lockUntil: 0 });
  return { ...teaseFor(count), lockedUntil: null };
}
