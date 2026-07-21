import { NextResponse } from "next/server";
import { z } from "zod";
import { compareSync } from "bcryptjs";
import { db } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/constants";
import { rateLimitGuard } from "@/lib/rate-limit";
import { maskEmail, startOtpChallenge } from "@/lib/login-otp";
import {
  FAIL_WINDOW_MS,
  LOCK_AFTER,
  LOCK_MINUTES,
  ghostFailure,
  ghostLock,
  lockNowError,
  lockedError,
  teaseFor,
} from "@/lib/login-guard";

const schema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
});

/**
 * Admin-portal login, step 1. Email-code 2FA is ALWAYS required; the password
 * step is skipped only while the account hasn't set one yet (passwordEnabled
 * false — fresh staff invites and the seeded admin account).
 *
 * Anti-enumeration: unknown emails follow the password path with the exact
 * same responses and lockout escalation as real accounts.
 */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "admin-login", 8, 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();
  const password = parsed.data.password;

  const user = await db.user.findFirst({
    where: { email, role: { in: STAFF_ROLES } },
  });
  const now = new Date();

  // active lockout rejects even the right password — that's the point
  const lock = user
    ? user.lockUntil && user.lockUntil > now
      ? user.lockUntil
      : null
    : await ghostLock(`admin:${email}`);
  if (lock) {
    return NextResponse.json(
      { error: lockedError(lock), locked: true },
      { status: 423 }
    );
  }

  // unknown email → behave exactly like a password-protected account
  if (!user) {
    if (!password) return NextResponse.json({ needPassword: true });
    const verdict = await ghostFailure(`admin:${email}`);
    return NextResponse.json(
      { error: verdict.error, locked: !!verdict.lockedUntil },
      { status: verdict.lockedUntil ? 423 : 401 }
    );
  }

  if (user.isBanned) {
    return NextResponse.json({ error: "هذا الحساب موقوف" }, { status: 403 });
  }

  if (user.passwordEnabled) {
    if (!password) return NextResponse.json({ needPassword: true });

    if (!compareSync(password, user.passwordHash)) {
      // same consecutive-failure escalation as the site login
      const stale =
        (user.lastFailedAt &&
          now.getTime() - user.lastFailedAt.getTime() > FAIL_WINDOW_MS) ||
        (user.lockUntil && user.lockUntil <= now);
      const count = (stale ? 0 : user.failedLogins) + 1;
      if (count >= LOCK_AFTER) {
        await db.user.update({
          where: { id: user.id },
          data: {
            failedLogins: 0,
            lastFailedAt: now,
            lockUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
          },
        });
        return NextResponse.json(
          { error: lockNowError(), locked: true },
          { status: 423 }
        );
      }
      await db.user.update({
        where: { id: user.id },
        data: { failedLogins: count, lastFailedAt: now, lockUntil: null },
      });
      return NextResponse.json(
        { error: teaseFor(count).error },
        { status: 401 }
      );
    }

    // right password wipes the failure history
    if (user.failedLogins > 0 || user.lockUntil) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lastFailedAt: null, lockUntil: null },
      });
    }
  }

  // 2FA — always, no opt-out for staff
  const otp = await startOtpChallenge(user);
  if (!otp.ok) {
    return NextResponse.json({ error: otp.error }, { status: 429 });
  }
  return NextResponse.json({
    requiresOtp: true,
    challenge: otp.challenge,
    email: maskEmail(user.email),
  });
}
