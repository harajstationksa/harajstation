import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { passwordSchema } from "@/lib/password-policy";
import { db } from "@/lib/db";
import { rateLimitGuard } from "@/lib/rate-limit";
import { hashOneTimeToken } from "@/lib/tokens";

const schema = z.object({
  token: z.string().min(32).max(128),
  password: passwordSchema,
});

/** Complete the forgot-password flow: single-use, time-limited token. */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "reset", 5, 10 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: apiMessage(req, "كلمة المرور يجب أن تكون 8 أحرف على الأقل") },
      { status: 400 },
    );
  }

  const reset = await db.passwordResetToken.findUnique({
    where: { token: hashOneTimeToken(parsed.data.token) },
    include: { user: true },
  });
  if (!reset || reset.usedAt || reset.expiresAt < new Date() || reset.user.isBanned) {
    return NextResponse.json(
      { error: apiMessage(req, "رابط إعادة التعيين غير صالح أو منتهي — اطلب رابطاً جديداً") },
      { status: 400 },
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);
  const changed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${reset.userId} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: reset.userId } });
    if (!current || current.isBanned || current.sessionVersion !== reset.user.sessionVersion)
      return false;
    const claimed = await tx.passwordResetToken.updateMany({
      where: {
        id: reset.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
        user: { isBanned: false },
      },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({
      where: { id: reset.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        failedLogins: 0,
        lastFailedAt: null,
        lockUntil: null,
      },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId } });
    await tx.loginOtp.deleteMany({ where: { userId: reset.userId } });
    return true;
  });
  if (!changed)
    return NextResponse.json(
      { error: apiMessage(req, "رابط إعادة التعيين غير صالح أو مستخدم") },
      { status: 400 },
    );
  return NextResponse.json({ ok: true });
}
