import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { startOtpChallenge, consumeOtp } from "@/lib/login-otp";
import { db } from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import { isValidDisplayName, normalizeSaudiPhone } from "@/lib/utils";
import { CITIES } from "@/lib/constants";
import { rateLimitGuard } from "@/lib/rate-limit";
import { emailConfigured, sendEmail } from "@/lib/email";
import { issueEmailVerification } from "@/lib/email-verify";

const schema = z.object({
  name: z.string().min(2).max(60),
  city: z.enum(CITIES),
  phone: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email().max(120).optional(),
  currentPassword: z.string().max(200).optional(),
  challenge: z.string().length(64).optional(),
  code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export async function PATCH(req: Request) {
  const limited = await rateLimitGuard(req, "account-update", 10, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: apiMessage(req, "بيانات غير صالحة") }, { status: 400 });
  }
  if (!isValidDisplayName(parsed.data.name)) {
    return NextResponse.json(
      { error: apiMessage(req, "الاسم يجب أن يحتوي حروفاً حقيقية (عربية أو إنجليزية)") },
      { status: 400 },
    );
  }

  let phone: string | null = null;
  if (parsed.data.phone) {
    phone = normalizeSaudiPhone(parsed.data.phone);
    if (!phone) {
      return NextResponse.json(
        { error: apiMessage(req, "رقم الجوال غير صالح — مثال: 05XXXXXXXX") },
        { status: 400 },
      );
    }
    const taken = await db.user.findFirst({
      // only a VERIFIED owner blocks a number; unverified entries cannot squat it
      where: { phone, phoneVerified: true, id: { not: user.id } },
    });
    if (taken) {
      return NextResponse.json(
        { error: apiMessage(req, "رقم الجوال مستخدم في حساب آخر") },
        { status: 409 },
      );
    }
  }

  // email change: the email is the account identifier, so it is guarded by
  // the current password and a uniqueness check
  const newEmail = parsed.data.email?.toLowerCase().trim();
  const emailChanged = !!newEmail && newEmail !== user.email;
  const oauthOnly = user.passwordHash.startsWith("oauth:");
  // Changing the address moves the whole account, so the CURRENT mailbox must
  // always approve it with a code — a stolen session + password is not enough.
  const needsOtp = true;
  if (emailChanged) {
    if (!emailConfigured()) {
      return NextResponse.json(
        { error: apiMessage(req, "لا يمكن تغيير البريد لأن خدمة التحقق غير متاحة") },
        { status: 503 },
      );
    }
    if (!oauthOnly && !parsed.data.currentPassword) {
      return NextResponse.json(
        { error: apiMessage(req, "أدخل كلمة المرور الحالية لتغيير البريد الإلكتروني") },
        { status: 400 },
      );
    }
    if (
      !oauthOnly &&
      (!parsed.data.currentPassword ||
        Buffer.byteLength(parsed.data.currentPassword) > 72 ||
        !(await compare(parsed.data.currentPassword, user.passwordHash)))
    ) {
      return NextResponse.json(
        { error: apiMessage(req, "كلمة المرور الحالية غير صحيحة") },
        { status: 403 },
      );
    }
    const emailTaken = await db.user.findFirst({
      where: { email: newEmail, id: { not: user.id } },
    });
    if (emailTaken) {
      return NextResponse.json(
        { error: apiMessage(req, "هذا البريد مستخدم في حساب آخر") },
        { status: 409 },
      );
    }
  }

  if (emailChanged && needsOtp && (!parsed.data.challenge || !parsed.data.code)) {
    const proof = await startOtpChallenge(user, "ACCOUNT_EMAIL_CHANGE", {
      email: user.email,
      name: newEmail,
    });
    return proof.ok
      ? NextResponse.json({ requiresOtp: true, challenge: proof.challenge })
      : NextResponse.json({ error: apiMessage(req, proof.error) }, { status: 429 });
  }
  const changed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (
      !current ||
      current.isBanned ||
      current.sessionVersion !== user.sessionVersion ||
      current.passwordHash !== user.passwordHash
    )
      return false;
    if (emailChanged && needsOtp) {
      const proof = await consumeOtp(
        tx,
        current,
        "ACCOUNT_EMAIL_CHANGE",
        parsed.data.challenge!,
        parsed.data.code!,
      );
      if (!proof.ok || proof.row.pendingName !== newEmail) return false;
    }
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        city: parsed.data.city,
        phone,
        // changing the number resets verification (future OTP flow)
        phoneVerified: phone === user.phone ? user.phoneVerified : false,
        ...(emailChanged
          ? {
              email: newEmail,
              emailVerifiedAt: null,
              twoFactorEmail: false,
              googleSub: null,
              sessionVersion: { increment: 1 },
            }
          : {}),
      },
    });

    if (emailChanged) {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.loginOtp.deleteMany({ where: { userId: user.id } });
      await tx.emailVerificationToken.deleteMany({
        where: { userId: user.id },
      });
    }
    return true;
  });
  if (!changed)
    return NextResponse.json(
      { error: apiMessage(req, "تغير الحساب؛ سجل الدخول مجددًا") },
      { status: 409 },
    );
  if (emailChanged && newEmail) {
    // tell the previous mailbox, so an unexpected change is noticed immediately
    await sendEmail({
      to: user.email,
      subject: "تم تغيير بريد حسابك في حراج ستيشن",
      html: `<div dir="rtl"><p>تم تغيير البريد الإلكتروني لحسابك في حراج ستيشن إلى عنوان آخر.</p><p>إن لم تكن أنت من قام بذلك فراسل الدعم فوراً بالرد على هذه الرسالة لاستعادة حسابك.</p></div>`,
      text: "تم تغيير البريد الإلكتروني لحسابك في حراج ستيشن. إن لم تكن أنت فراسل الدعم فوراً بالرد على هذه الرسالة.",
    }).catch(() => false);
    const sent = await issueEmailVerification(user.id, newEmail).catch(() => false);
    const res = NextResponse.json(
      sent
        ? { ok: true, needsVerification: true }
        : {
            error: apiMessage(
              req,
              "تم تغيير البريد، لكن تعذّر إرسال رسالة التفعيل. استخدم إعادة الإرسال.",
            ),
          },
      { status: sent ? 200 : 503 },
    );
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  return NextResponse.json({ ok: true });
}
