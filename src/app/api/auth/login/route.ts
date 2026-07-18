import { NextResponse } from "next/server";
import { z } from "zod";
import { compareSync } from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
} from "@/lib/auth";
import { normalizeSaudiPhone } from "@/lib/utils";
import { isRateLimited, rateLimitGuard } from "@/lib/rate-limit";
import { emailConfigured, sendLoginCodeEmail } from "@/lib/email";
import {
  FAIL_WINDOW_MS,
  LOCK_AFTER,
  LOCK_MINUTES,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  ghostFailure,
  ghostLock,
  hashOtp,
  lockNowError,
  lockedError,
  teaseFor,
} from "@/lib/login-guard";

const schema = z.object({
  identifier: z.string().min(3), // phone or email
  password: z.string().min(1),
});

/** m***@gmail.com — enough to recognise the inbox, useless to a shoulder-surfer */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Start (or reuse) an email-2FA challenge for a password-verified user.
 * Guards the mail quota: 60s cooldown reuses the pending code without a new
 * mail, and issuance is capped per account on top of the per-inbox mail cap.
 */
async function startOtpChallenge(user: { id: string; email: string }) {
  const now = Date.now();
  const pending = await db.loginOtp.findFirst({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date(now) } },
    orderBy: { createdAt: "desc" },
  });
  // a code was mailed moments ago — point the browser at it, send nothing
  if (pending && now - pending.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return { ok: true as const, challenge: pending.challenge };
  }
  if (await isRateLimited(`otp-send:${user.id}`, 6, 60 * 60_000)) {
    return {
      ok: false as const,
      error: "طلبت رموزاً كثيرة خلال ساعة — هدّئ عليك شوي وحاول بعدين 😉",
    };
  }
  // one active challenge per account
  await db.loginOtp.deleteMany({ where: { userId: user.id } });
  const challenge = randomBytes(32).toString("hex");
  const code = String(randomInt(100000, 1000000));
  await db.loginOtp.create({
    data: {
      userId: user.id,
      challenge,
      codeHash: hashOtp(code, challenge),
      expiresAt: new Date(now + OTP_TTL_MS),
    },
  });
  const sent = await sendLoginCodeEmail(user.email, code);
  if (!sent) {
    return { ok: false as const, error: "تعذّر إرسال رمز التحقق — حاول بعد قليل" };
  }
  return { ok: true as const, challenge };
}

export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "login", 8, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const { identifier, password } = parsed.data;
  const phone = normalizeSaudiPhone(identifier);
  const idKey = phone ?? identifier.toLowerCase();
  const user = await db.user.findFirst({
    where: phone ? { phone } : { email: identifier.toLowerCase() },
  });

  const now = new Date();

  // active lockout rejects even the right password — that's the point
  const lock = user
    ? user.lockUntil && user.lockUntil > now
      ? user.lockUntil
      : null
    : await ghostLock(idKey);
  if (lock) {
    return NextResponse.json(
      { error: lockedError(lock), locked: true, suggestReset: true },
      { status: 423 }
    );
  }

  if (!user || !compareSync(password, user.passwordHash)) {
    if (!user) {
      // same escalation for identifiers that match no account, so responses
      // never reveal which accounts exist
      const verdict = await ghostFailure(idKey);
      return NextResponse.json(
        { error: verdict.error, suggestReset: verdict.suggestReset, locked: !!verdict.lockedUntil },
        { status: verdict.lockedUntil ? 423 : 401 }
      );
    }
    // stale counters restart: the window passed, or an old lock already expired
    const stale =
      (user.lastFailedAt && now.getTime() - user.lastFailedAt.getTime() > FAIL_WINDOW_MS) ||
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
        { error: lockNowError(), locked: true, suggestReset: true },
        { status: 423 }
      );
    }
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: count, lastFailedAt: now, lockUntil: null },
    });
    const { error, suggestReset } = teaseFor(count);
    return NextResponse.json({ error, suggestReset }, { status: 401 });
  }

  if (user.isBanned) {
    return NextResponse.json(
      { error: "هذا الحساب محظور. تواصل مع الدعم." },
      { status: 403 }
    );
  }
  // No session until the address is confirmed. Only enforced when mail is
  // actually configured — otherwise nobody could ever verify, and the guard
  // would lock every account out instead of protecting them.
  if (emailConfigured() && !user.emailVerifiedAt) {
    return NextResponse.json(
      {
        error: "فعّل بريدك الإلكتروني أولاً — أرسلنا لك رابط التفعيل عند التسجيل",
        needsVerification: true,
        email: user.email,
      },
      { status: 403 }
    );
  }

  // right password wipes the failure history
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
      return NextResponse.json({ error: otp.error }, { status: 429 });
    }
    return NextResponse.json({
      requiresOtp: true,
      challenge: otp.challenge,
      email: maskEmail(user.email),
    });
  }

  const token = await signSessionToken({
    sub: user.id,
    role: user.role,
    name: user.name,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
