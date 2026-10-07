import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { passwordSchema } from "@/lib/password-policy";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/constants";
import { rateLimitGuard } from "@/lib/rate-limit";
import { consumeOtp } from "@/lib/login-otp";
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "admin-reset", 10, 600000);
  if (limited) return limited;
  const p = z
    .object({
      challenge: z.string().length(64),
      code: z.string().regex(/^\d{6}$/),
      password: passwordSchema.refine((value) => value.length >= 10),
    })
    .safeParse(await req.json().catch(() => null));
  if (!p.success || Buffer.byteLength(p.data.password) > 72)
    return NextResponse.json(
      { error: apiMessage(req, "راجع الرمز وكلمة المرور (10 أحرف على الأقل)") },
      { status: 400 },
    );
  const row = await db.loginOtp.findUnique({
    where: { challenge: p.data.challenge },
    select: { userId: true },
  });
  if (!row)
    return NextResponse.json({ error: apiMessage(req, "رمز غير صالح أو منتهي") }, { status: 400 });
  const passwordHash = await hash(p.data.password, 12);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${row.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: row.userId } });
    if (!STAFF_ROLES.includes(user.role))
      return NextResponse.json({ error: apiMessage(req, "رمز غير صالح") }, { status: 400 });
    const proof = await consumeOtp(tx, user, "ADMIN_RESET", p.data.challenge, p.data.code);
    if (!proof.ok)
      return NextResponse.json({ error: apiMessage(req, proof.error) }, { status: 400 });
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordEnabled: true,
        sessionVersion: { increment: 1 },
        failedLogins: 0,
        lastFailedAt: null,
        lockUntil: null,
      },
    });
    await tx.loginOtp.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "ADMIN_PASSWORD_RESET",
        detail: "Mailbox confirmed; sessions revoked",
      },
    });
    return NextResponse.json({ ok: true });
  });
}
