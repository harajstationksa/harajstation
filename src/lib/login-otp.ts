import { randomBytes, randomInt } from "node:crypto";
import { db } from "./db";
import { isRateLimited } from "./rate-limit";
import { emailConfigured, sendLoginCodeEmail } from "./email";
import { OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, hashOtp } from "./login-guard";

/** m***@gmail.com — enough to recognise the inbox, useless to a shoulder-surfer */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Start (or reuse) an email-OTP challenge for a verified user. Shared by the
 * site login (opt-in 2FA) and the admin portal login (2FA always on).
 * Guards the mail quota: 60s cooldown reuses the pending code without a new
 * mail, and issuance is capped per account on top of the per-inbox mail cap.
 */
export async function startOtpChallenge(user: { id: string; email: string }) {
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
  // local dev without SMTP: print the code instead of failing the login
  if (!emailConfigured() && process.env.NODE_ENV !== "production") {
    console.log(`[dev] login code for ${user.email}: ${code}`);
    return { ok: true as const, challenge };
  }
  const sent = await sendLoginCodeEmail(user.email, code);
  if (!sent) {
    return { ok: false as const, error: "تعذّر إرسال رمز التحقق — حاول بعد قليل" };
  }
  return { ok: true as const, challenge };
}
