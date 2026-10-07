import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { consumeOtp, startOtpChallenge } from "@/lib/login-otp";
import { rateLimitGuard } from "@/lib/rate-limit";
const schema = z.object({
  enabled: z.boolean(),
  currentPassword: z.string().max(200).optional(),
  challenge: z.string().length(64).optional(),
  code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "2fa-toggle", 10, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: apiMessage(req, "أدخل كلمة المرور الحالية وبيانات التحقق") },
      { status: 400 },
    );
  if (!emailConfigured() || !user.emailVerifiedAt)
    return NextResponse.json(
      { error: apiMessage(req, "خدمة التحقق غير متاحة أو البريد غير مفعّل") },
      { status: 503 },
    );
  const { enabled, currentPassword, challenge, code } = parsed.data;
  const socialOnly = user.passwordHash.startsWith("oauth:google:") && !!user.googleSub;
  if (!socialOnly && !currentPassword)
    return NextResponse.json(
      { error: apiMessage(req, "أدخل كلمة المرور الحالية") },
      { status: 400 },
    );
  if (
    !socialOnly &&
    (!currentPassword ||
      Buffer.byteLength(currentPassword) > 72 ||
      !(await compare(currentPassword, user.passwordHash)))
  )
    return NextResponse.json(
      { error: apiMessage(req, "كلمة المرور الحالية غير صحيحة") },
      { status: 403 },
    );
  if (!challenge || !code) {
    const otp = await startOtpChallenge(user, "ACCOUNT_2FA", {
      email: user.email,
      name: enabled ? "enable" : "disable",
    });
    return otp.ok
      ? NextResponse.json({ requiresOtp: true, challenge: otp.challenge })
      : NextResponse.json({ error: apiMessage(req, otp.error) }, { status: 429 });
  }
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (
      fresh.isBanned ||
      fresh.sessionVersion !== user.sessionVersion ||
      fresh.passwordHash !== user.passwordHash
    )
      return { error: apiMessage(req, "تغير الحساب؛ اطلب تحققًا جديدًا") };
    const proof = await consumeOtp(tx, fresh, "ACCOUNT_2FA", challenge, code);
    if (!proof.ok) return { error: apiMessage(req, proof.error) };
    if (proof.row.pendingName !== (enabled ? "enable" : "disable"))
      return { error: apiMessage(req, "الرمز لا يخص هذا التغيير") };
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { twoFactorEmail: enabled, sessionVersion: { increment: 1 } },
    });
    await tx.loginOtp.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    return { user: updated };
  });
  if ("error" in result)
    return NextResponse.json({ error: apiMessage(req, result.error) }, { status: 400 });
  const token = await signSessionToken(
    { sub: user.id, role: result.user.role, name: result.user.name },
    result.user.sessionVersion,
  );
  const response = NextResponse.json({ ok: true, enabled });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
