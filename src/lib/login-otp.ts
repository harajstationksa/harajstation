import { randomBytes, randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { isRateLimited } from "./rate-limit";
import { emailConfigured, sendLoginCodeEmail } from "./email";
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, hashOtp } from "./login-guard";
import { safeEqual } from "./crypto";
import type { OtpEmailPurpose } from "./email-templates";

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}
export type OtpPurpose = OtpEmailPurpose;
export async function startOtpChallenge(
  user: { id: string; email: string; sessionVersion?: number },
  purpose: OtpPurpose = "SITE_LOGIN",
  target?: { email: string; name?: string },
) {
  const fresh = await db.user.findUnique({
    where: { id: user.id },
    select: { sessionVersion: true, email: true, isBanned: true },
  });
  if (
    !fresh ||
    fresh.isBanned ||
    (user.sessionVersion !== undefined && user.sessionVersion !== fresh.sessionVersion) ||
    fresh.email !== user.email
  )
    return { ok: false as const, error: "تغير الحساب؛ اطلب تحققًا جديدًا" };
  const email = target?.email ?? fresh.email,
    now = Date.now();
  const pending = await db.loginOtp.findFirst({
    where: {
      userId: user.id,
      purpose,
      issuedEmail: email,
      pendingName: target?.name ?? null,
      attempts: { lt: OTP_MAX_ATTEMPTS },
      sessionVersion: fresh.sessionVersion,
      consumedAt: null,
      deliveredAt: { not: null },
      expiresAt: { gt: new Date(now) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (pending && now - pending.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS)
    return { ok: true as const, challenge: pending.challenge };
  if (await isRateLimited(`otp-send:${user.id}`, 6, 3600000))
    return {
      ok: false as const,
      error: "وصلت للحد المسموح لرموز البريد؛ انتظر ثم حاول مجددًا",
    };
  const challenge = randomBytes(32).toString("hex"),
    code = String(randomInt(100000, 1000000));
  const sent =
    !emailConfigured() && process.env.NODE_ENV !== "production"
      ? (console.log(`[dev] login code for ${email}: ${code}`), true)
      : await sendLoginCodeEmail(email, code, purpose);
  if (!sent)
    return {
      ok: false as const,
      error: "تعذّر إرسال رمز التحقق؛ لم يتغير حسابك. حاول بعد قليل",
    };
  const issued = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (
      current.isBanned ||
      current.sessionVersion !== fresh.sessionVersion ||
      current.email !== fresh.email
    )
      return false;
    await tx.loginOtp.updateMany({
      where: { userId: user.id, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.loginOtp.create({
      data: {
        userId: user.id,
        challenge,
        purpose,
        sessionVersion: current.sessionVersion,
        issuedEmail: email,
        pendingName: target?.name,
        codeHash: hashOtp(code, challenge),
        deliveredAt: new Date(),
        expiresAt: new Date(now + OTP_TTL_MS),
      },
    });
    return true;
  });
  return issued
    ? { ok: true as const, challenge }
    : { ok: false as const, error: "تغيرت بيانات الحساب؛ اطلب رمزًا جديدًا" };
}

/** Caller locks the user first; invalid attempt counts must still commit. */
export async function consumeOtp(
  tx: Prisma.TransactionClient,
  user: {
    id: string;
    email: string;
    sessionVersion: number;
    isBanned: boolean;
  },
  purpose: OtpPurpose,
  challenge: string,
  code: string,
) {
  await tx.$queryRaw`SELECT id FROM "LoginOtp" WHERE challenge=${challenge} FOR UPDATE`;
  const row = await tx.loginOtp.findUnique({ where: { challenge } });
  if (
    !row ||
    row.userId !== user.id ||
    row.purpose !== purpose ||
    row.sessionVersion !== user.sessionVersion ||
    user.isBanned ||
    !row.deliveredAt ||
    row.consumedAt ||
    row.expiresAt <= new Date() ||
    row.attempts >= OTP_MAX_ATTEMPTS ||
    (purpose !== "ADMIN_EMAIL_CHANGE" && row.issuedEmail !== user.email)
  )
    return {
      ok: false as const,
      error: "انتهت صلاحية التحقق؛ اطلب رمزًا جديدًا",
    };
  if (!/^\d{6}$/.test(code) || !safeEqual(hashOtp(code, challenge), row.codeHash)) {
    await tx.loginOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    return {
      ok: false as const,
      error: `رمز غير صحيح؛ باقي ${left} محاولات`,
      invalid: true,
      left,
    };
  }
  await tx.loginOtp.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true as const, row };
}
