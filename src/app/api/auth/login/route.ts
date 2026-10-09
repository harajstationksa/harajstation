import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { loginPasswordSchema } from "@/lib/password-policy";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";
import { normalizeSaudiPhone } from "@/lib/utils";
import { clientIp, rateLimitGuard } from "@/lib/rate-limit";
import { emailConfigured } from "@/lib/email";
import { maskEmail, startOtpChallenge } from "@/lib/login-otp";
import {
  ACCOUNT_LOCK_AFTER,
  FAIL_WINDOW_MS,
  LOCK_MINUTES,
  ghostFailure,
  ghostLock,
  lockNowError,
  lockedError,
  loginPairKey,
  pairFailure,
  pairLock,
  pairReset,
} from "@/lib/login-guard";

const schema = z.object({
  identifier: z.string().min(3), // phone or email
  password: loginPasswordSchema,
});

// Valid cost-12 hash; a missing/OAuth account still performs the same bcrypt work.
const DUMMY_PASSWORD_HASH = "$2b$12$DRAK9nUwLNWlp9uHKXjFJuGQdpQe6DI2bRxVQKsaHdPowvztKYa7m";

export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "login", 8, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: apiMessage(req, "بيانات غير صالحة") }, { status: 400 });
  }

  const { identifier, password } = parsed.data;
  const phone = normalizeSaudiPhone(identifier);
  const idKey = phone ?? identifier.toLowerCase();
  const user = await db.user.findFirst({
    // only a verified number identifies an account (numbers are not unique until verified)
    where: phone ? { phone, phoneVerified: true } : { email: identifier.toLowerCase() },
  });

  const now = new Date();
  // Locks are per (account, network): an attacker who knows an address only
  // shuts out their own network, never the owner's. The account-wide lock in
  // the database is the backstop for distributed guessing.
  const pairKey = loginPairKey(user?.id ?? `ghost:${idKey}`, clientIp(req));

  // active lockout rejects even the right password — that's the point
  const lock =
    user?.lockUntil && user.lockUntil > now
      ? user.lockUntil
      : user
        ? await pairLock(pairKey)
        : await ghostLock(pairKey);
  if (lock) {
    return NextResponse.json(
      { error: apiMessage(req, lockedError(lock)), locked: true, suggestReset: true },
      { status: 423 },
    );
  }

  const passwordMatches = await compare(
    password,
    user?.passwordHash.startsWith("$2") ? user.passwordHash : DUMMY_PASSWORD_HASH,
  );
  if (!user || !passwordMatches) {
    if (!user) {
      // same escalation for identifiers that match no account, so responses
      // never reveal which accounts exist
      const verdict = await ghostFailure(pairKey);
      return NextResponse.json(
        {
          error: apiMessage(req, verdict.error),
          suggestReset: verdict.suggestReset,
          locked: !!verdict.lockedUntil,
        },
        { status: verdict.lockedUntil ? 423 : 401 },
      );
    }
    const verdict = await pairFailure(pairKey);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.lockUntil && fresh.lockUntil > now)
        return NextResponse.json(
          {
            error: apiMessage(req, lockedError(fresh.lockUntil)),
            locked: true,
            suggestReset: true,
          },
          { status: 423 },
        );
      // stale counters restart: the window passed, or an old lock already expired
      const stale =
        (fresh.lastFailedAt && now.getTime() - fresh.lastFailedAt.getTime() > FAIL_WINDOW_MS) ||
        (fresh.lockUntil && fresh.lockUntil <= now);
      const count = (stale ? 0 : fresh.failedLogins) + 1;
      if (count >= ACCOUNT_LOCK_AFTER) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLogins: 0,
            lastFailedAt: now,
            lockUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
          },
        });
        return NextResponse.json(
          { error: apiMessage(req, lockNowError()), locked: true, suggestReset: true },
          { status: 423 },
        );
      }
      await tx.user.update({
        where: { id: user.id },
        data: { failedLogins: count, lastFailedAt: now, lockUntil: null },
      });
      return NextResponse.json(
        {
          error: apiMessage(req, verdict.error),
          suggestReset: verdict.suggestReset,
          locked: !!verdict.lockedUntil,
        },
        { status: verdict.lockedUntil ? 423 : 401 },
      );
    });
  }

  if (user.isBanned) {
    return NextResponse.json(
      { error: apiMessage(req, "هذا الحساب محظور. تواصل مع الدعم.") },
      { status: 403 },
    );
  }
  // staff accounts exist only on the admin portal — the public site refuses
  // them outright so a leaked staff password alone opens nothing here
  if (STAFF_ROLES.includes(user.role)) {
    return NextResponse.json(
      { error: apiMessage(req, "حسابات فريق العمل تسجل الدخول من بوابة الإدارة فقط") },
      { status: 403 },
    );
  }
  if (!emailConfigured() && (!user.emailVerifiedAt || user.twoFactorEmail)) {
    return NextResponse.json(
      { error: apiMessage(req, "خدمة البريد غير متاحة ولا يمكن إكمال التحقق بأمان") },
      { status: 503 },
    );
  }
  // No session until the address is confirmed. Only enforced when mail is
  // actually configured — otherwise nobody could ever verify, and the guard
  // would lock every account out instead of protecting them.
  if (emailConfigured() && !user.emailVerifiedAt) {
    return NextResponse.json(
      {
        error: apiMessage(req, "فعّل بريدك الإلكتروني أولاً — أرسلنا لك رابط التفعيل عند التسجيل"),
        needsVerification: true,
        email: user.email,
      },
      { status: 403 },
    );
  }

  // Bind credentials to the security snapshot that was actually checked.
  // An update after this read still invalidates the token's explicit version.
  const fresh = await db.user.findUnique({ where: { id: user.id } });
  if (
    !fresh ||
    fresh.isBanned ||
    fresh.passwordHash !== user.passwordHash ||
    fresh.sessionVersion !== user.sessionVersion ||
    fresh.email !== user.email ||
    fresh.twoFactorEmail !== user.twoFactorEmail ||
    fresh.role !== user.role ||
    (fresh.lockUntil && fresh.lockUntil > new Date())
  ) {
    return NextResponse.json(
      { error: apiMessage(req, "تغيرت بيانات الحساب؛ حاول تسجيل الدخول مجددًا") },
      { status: 409 },
    );
  }
  // right password wipes the failure history
  await pairReset(pairKey);
  if (user.failedLogins > 0 || user.lockUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lastFailedAt: null, lockUntil: null },
    });
  }

  // email 2FA: no session yet — mail a one-time code and hand the browser an
  // opaque challenge for the second step
  if (user.twoFactorEmail && emailConfigured()) {
    const otp = await startOtpChallenge(user);
    if (!otp.ok) {
      return NextResponse.json({ error: apiMessage(req, otp.error) }, { status: 429 });
    }
    return NextResponse.json({
      requiresOtp: true,
      challenge: otp.challenge,
      email: maskEmail(user.email),
    });
  }

  const token = await signSessionToken(
    {
      sub: user.id,
      role: user.role,
      name: user.name,
    },
    user.sessionVersion,
  );
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
