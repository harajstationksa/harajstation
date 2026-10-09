"use server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff, ADMIN_COOKIE } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";
import { startOtpChallenge, consumeOtp } from "@/lib/login-otp";
import { ok, fail, audit, type AdminResult } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import QRCode from "qrcode";
import { encryptText, decryptText } from "@/lib/crypto";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";

export async function requestAccountCodeAction(): Promise<AdminResult> {
  const me = await requireStaff(STAFF_ROLES);
  const sent = await startOtpChallenge(me, "ADMIN_STEPUP");
  return sent.ok
    ? {
        ok: true,
        message: "أرسلنا رمزًا إلى بريدك الحالي لتأكيد هويتك",
        challenge: sent.challenge,
        stage: "verify",
      }
    : fail(sent.error);
}
export async function updateAccountAction(data: FormData): Promise<AdminResult> {
  const me = await requireStaff(STAFF_ROLES);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z
        .email()
        .max(254)
        .transform((s) => s.toLowerCase()),
    })
    .safeParse({ name: data.get("name"), email: data.get("email") });
  if (!parsed.success) return fail("أدخل اسمًا وبريدًا صالحين");
  const taken = await db.user.count({
    where: { email: parsed.data.email, id: { not: me.id } },
  });
  if (taken) return fail("لا يمكن استخدام هذا البريد");
  const emailChanged = parsed.data.email !== me.email;
  const verified = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${me.id} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: me.id } });
    if (user.sessionVersion !== me.sessionVersion || user.email !== me.email)
      return fail("تغير الحساب؛ سجل الدخول مجددًا");
    const proof = await consumeOtp(
      tx,
      user,
      "ADMIN_STEPUP",
      String(data.get("challenge") ?? ""),
      String(data.get("code") ?? ""),
    );
    if (!proof.ok) return fail(proof.error);
    if (!emailChanged) {
      await tx.user.update({
        where: { id: user.id },
        data: { name: parsed.data.name },
      });
      await audit(tx, user.id, "UPDATE_MY_NAME", parsed.data.name);
    }
    return ok();
  });
  if (!verified.ok) return verified;
  if (!emailChanged) {
    revalidatePath("/admin/account");
    return ok("تم تحديث الاسم");
  }
  const sent = await startOtpChallenge(me, "ADMIN_EMAIL_CHANGE", {
    email: parsed.data.email,
    name: parsed.data.name,
  });
  return sent.ok
    ? {
        ok: true,
        message: "بريدك الحالي لم يتغير. أدخل الرمز المرسل للبريد الجديد لاعتماده",
        challenge: sent.challenge,
        stage: "email",
      }
    : fail(sent.error);
}
export async function confirmAccountEmailAction(data: FormData): Promise<AdminResult> {
  const me = await requireStaff(STAFF_ROLES);
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${me.id} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: me.id } });
    if (user.sessionVersion !== me.sessionVersion) return fail("أعد تسجيل الدخول");
    const proof = await consumeOtp(
      tx,
      user,
      "ADMIN_EMAIL_CHANGE",
      String(data.get("challenge") ?? ""),
      String(data.get("code") ?? ""),
    );
    if (!proof.ok) return fail(proof.error);
    if (
      await tx.user.count({
        where: { email: proof.row.issuedEmail, id: { not: me.id } },
      })
    )
      return fail("لا يمكن اعتماد هذا البريد");
    await tx.user.update({
      where: { id: me.id },
      data: {
        email: proof.row.issuedEmail,
        name: proof.row.pendingName ?? user.name,
        emailVerifiedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    await tx.loginOtp.deleteMany({ where: { userId: me.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: me.id } });
    await audit(tx, me.id, "UPDATE_MY_EMAIL", "Email ownership confirmed; sessions revoked");
    return ok("تم اعتماد البريد الجديد. سجل الدخول مجددًا");
  });
  if (result.ok) {
    (await cookies()).delete(ADMIN_COOKIE);
    await sendEmail({
      to: me.email,
      subject: "تغير بريد حسابك الإداري",
      html: '<p dir="rtl">تم تأكيد تغيير البريد لحسابك الإداري. إن لم تكن أنت فتواصل مع الدعم فورًا.</p>',
    });
  }
  return result.ok ? { ...result, stage: "login" } : result;
}
export async function changeAccountPasswordAction(data: FormData): Promise<AdminResult> {
  const me = await requireStaff(STAFF_ROLES);
  const password = String(data.get("password") ?? "");
  if (password.length < 10 || Buffer.byteLength(password) > 72 || password !== data.get("confirm"))
    return fail("كلمة المرور لا تقل عن 10 أحرف، لا تتجاوز 72 بايت، وتطابق التأكيد");
  const passwordHash = await hash(password, 12);
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${me.id} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: me.id } });
    if (user.sessionVersion !== me.sessionVersion) return fail("أعد تسجيل الدخول");
    const proof = await consumeOtp(
      tx,
      user,
      "ADMIN_STEPUP",
      String(data.get("challenge") ?? ""),
      String(data.get("code") ?? ""),
    );
    if (!proof.ok) return fail(proof.error);
    await tx.user.update({
      where: { id: me.id },
      data: {
        passwordHash,
        passwordEnabled: true,
        sessionVersion: { increment: 1 },
        failedLogins: 0,
        lockUntil: null,
        lastFailedAt: null,
      },
    });
    await tx.loginOtp.deleteMany({ where: { userId: me.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: me.id } });
    await audit(tx, me.id, "SET_MY_PASSWORD", "Verified current mailbox; sessions revoked");
    return ok("تغيرت كلمة المرور؛ سجل الدخول مجددًا");
  });
  if (result.ok) (await cookies()).delete(ADMIN_COOKIE);
  return result.ok ? { ...result, stage: "login" } : result;
}

/* ── Authenticator app (TOTP) ──────────────────────────────────────────── */

export type TotpEnrollment = AdminResult & { secret?: string; qr?: string };

/** Begin enrollment: a fresh secret is stored pending until a code confirms it. */
export async function startTotpEnrollmentAction(): Promise<TotpEnrollment> {
  const me = await requireStaff(STAFF_ROLES);
  if (me.totpEnabledAt) return fail("تطبيق المصادقة مفعّل بالفعل؛ عطّله أولاً لتغيير الجهاز");
  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: me.id },
    data: { totpSecret: encryptText(secret), totpEnabledAt: null, totpLastStep: null },
  });
  const qr = await QRCode.toDataURL(totpUri(secret, me.email), { margin: 1, width: 220 });
  return {
    ok: true,
    message: "امسح الرمز بتطبيق المصادقة ثم أدخل الرمز الظاهر فيه",
    secret,
    qr,
    stage: "totp-confirm",
  };
}

export async function confirmTotpEnrollmentAction(data: FormData): Promise<AdminResult> {
  const me = await requireStaff(STAFF_ROLES);
  const code = String(data.get("totp") ?? "");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${me.id} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: me.id } });
    if (user.totpEnabledAt) return fail("تطبيق المصادقة مفعّل بالفعل");
    if (!user.totpSecret) return fail("ابدأ التفعيل من جديد");
    const step = verifyTotp(decryptText(user.totpSecret), code);
    if (step === null) return fail("الرمز غير صحيح؛ تأكد من وقت الجهاز وأعد المحاولة");
    await tx.user.update({
      where: { id: me.id },
      data: { totpEnabledAt: new Date(), totpLastStep: step },
    });
    await audit(tx, me.id, "ENABLE_TOTP", "Authenticator app enrolled");
    return ok("تم تفعيل تطبيق المصادقة؛ سيُطلب رمزه مع رمز البريد في كل دخول");
  });
}

export async function disableTotpAction(data: FormData): Promise<AdminResult> {
  const me = await requireStaff(STAFF_ROLES);
  const code = String(data.get("totp") ?? "");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${me.id} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!user.totpEnabledAt || !user.totpSecret) return fail("تطبيق المصادقة غير مفعّل");
    if (verifyTotp(decryptText(user.totpSecret), code, user.totpLastStep) === null)
      return fail("الرمز غير صحيح");
    await tx.user.update({
      where: { id: me.id },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
    });
    await audit(tx, me.id, "DISABLE_TOTP", "Authenticator app removed by its owner");
    return ok("تم تعطيل تطبيق المصادقة");
  });
}
