import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import {
  ADMIN_COOKIE,
  SESSION_COOKIE,
  adminCookieOptions,
  sessionCookieOptions,
  signAdminToken,
  signSessionToken,
} from "./auth";
import { consumeOtp, type OtpPurpose } from "./login-otp";
import { isRateLimited, rateLimitGuard } from "./rate-limit";
import { STAFF_ROLES } from "./constants";
import { sendLoginCodeEmail } from "./email";
import { cookieValue, OAUTH_OTP_COOKIE } from "./google-oauth";
import { hashOtp, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "./login-guard";
import { verifyTotp } from "./totp";
import { decryptText } from "./crypto";
const expired = () =>
  NextResponse.json(
    { error: "انتهت صلاحية التحقق؛ ابدأ تسجيل الدخول من جديد", restart: true },
    { status: 400 },
  );
export async function verifyLoginOtp(req: Request, admin: boolean) {
  const limited = await rateLimitGuard(req, admin ? "admin-login-otp" : "login-otp", 15, 600000);
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = z
    .object({
      challenge: z.string().length(64),
      code: z.string().regex(/^\d{6}$/),
    })
    .safeParse({
      ...body,
      challenge: body?.challenge ?? (!admin ? cookieValue(req, OAUTH_OTP_COOKIE) : undefined),
    });
  if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const pending = await db.loginOtp.findUnique({
    where: { challenge: parsed.data.challenge },
    select: { userId: true },
  });
  if (!pending) return expired();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${pending.userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: pending.userId } });
    if (!user || user.isBanned || STAFF_ROLES.includes(user.role) !== admin) return expired();
    // Staff with an authenticator app must also prove possession of it, so a
    // compromised mailbox alone never opens the portal. A wrong app code
    // spends one of the challenge's attempts, like a wrong email code.
    let totpStep: number | null = null;
    if (admin && user.totpEnabledAt && user.totpSecret) {
      const totp = typeof body?.totp === "string" ? body.totp : "";
      totpStep = verifyTotp(decryptText(user.totpSecret), totp, user.totpLastStep);
      if (totpStep === null) {
        const row = await tx.loginOtp.findUnique({ where: { challenge: parsed.data.challenge } });
        if (!row || row.userId !== user.id || row.consumedAt) return expired();
        await tx.loginOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
        const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
        return NextResponse.json(
          {
            error: "رمز تطبيق المصادقة غير صحيح أو مستخدم من قبل",
            totp: true,
            restart: left <= 0,
          },
          { status: left <= 0 ? 400 : 401 },
        );
      }
    }
    const verified = await consumeOtp(
      tx,
      user,
      admin ? "ADMIN_LOGIN" : "SITE_LOGIN",
      parsed.data.challenge,
      parsed.data.code,
    );
    if (!verified.ok) {
      const invalid = "invalid" in verified && verified.invalid;
      const restart = !invalid || ("left" in verified && verified.left <= 0);
      return NextResponse.json({ error: verified.error, restart }, { status: restart ? 400 : 401 });
    }
    if (totpStep !== null)
      await tx.user.update({ where: { id: user.id }, data: { totpLastStep: totpStep } });
    if (admin)
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "ADMIN_LOGIN",
          detail: "portal login",
        },
      });
    const payload = { sub: user.id, role: user.role, name: user.name };
    const token = admin
      ? await signAdminToken(payload, user.sessionVersion)
      : await signSessionToken(payload, user.sessionVersion);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(
      admin ? ADMIN_COOKIE : SESSION_COOKIE,
      token,
      admin ? adminCookieOptions : sessionCookieOptions,
    );
    if (!admin) res.cookies.delete(OAUTH_OTP_COOKIE);
    return res;
  });
}
export async function resendLoginOtp(req: Request, admin: boolean) {
  const limited = await rateLimitGuard(
    req,
    admin ? "admin-otp-resend" : "login-otp-resend",
    6,
    600000,
  );
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = z.object({ challenge: z.string().length(64) }).safeParse({
    ...body,
    challenge: body?.challenge ?? (!admin ? cookieValue(req, OAUTH_OTP_COOKIE) : undefined),
  });
  if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const otp = await db.loginOtp.findUnique({
    where: { challenge: parsed.data.challenge },
    include: { user: true },
  });
  const purpose: OtpPurpose = admin ? "ADMIN_LOGIN" : "SITE_LOGIN";
  if (
    !otp ||
    otp.purpose !== purpose ||
    otp.consumedAt ||
    otp.expiresAt <= new Date() ||
    otp.attempts >= OTP_MAX_ATTEMPTS ||
    otp.user.isBanned ||
    otp.sessionVersion !== otp.user.sessionVersion ||
    otp.issuedEmail !== otp.user.email ||
    STAFF_ROLES.includes(otp.user.role) !== admin
  )
    return expired();
  const wait = OTP_RESEND_COOLDOWN_MS - (Date.now() - otp.lastSentAt.getTime());
  if (wait > 0)
    return NextResponse.json(
      { error: `انتظر ${Math.ceil(wait / 1000)} ثانية قبل إعادة الإرسال` },
      { status: 429 },
    );
  if (await isRateLimited(`otp-send:${otp.userId}`, 6, 3600000))
    return NextResponse.json({ error: "وصلت للحد المسموح لإرسال الرموز" }, { status: 429 });
  const code = String(randomInt(100000, 1000000));
  if (!(await sendLoginCodeEmail(otp.issuedEmail, code, purpose)))
    return NextResponse.json({ error: "تعذّر الإرسال؛ الرمز السابق لم يتغير" }, { status: 503 });
  const updated = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${otp.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: otp.userId } });
    if (
      user.isBanned ||
      user.sessionVersion !== otp.sessionVersion ||
      user.email !== otp.issuedEmail
    )
      return false;
    const changed = await tx.loginOtp.updateMany({
      where: {
        id: otp.id,
        consumedAt: null,
        lastSentAt: otp.lastSentAt,
        expiresAt: { gt: new Date() },
        attempts: { lt: OTP_MAX_ATTEMPTS },
      },
      data: {
        codeHash: hashOtp(code, otp.challenge),
        attempts: 0,
        lastSentAt: new Date(),
        deliveredAt: new Date(),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    return changed.count === 1;
  });
  return updated ? NextResponse.json({ ok: true }) : expired();
}
