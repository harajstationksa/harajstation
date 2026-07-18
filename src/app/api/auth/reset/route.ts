import { NextResponse } from "next/server";
import { hashSync } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(100),
});

/** Complete the forgot-password flow: single-use, time-limited token. */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "reset", 5, 10 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" },
      { status: 400 }
    );
  }

  const reset = await db.passwordResetToken.findUnique({
    where: { token: parsed.data.token },
    include: { user: true },
  });
  if (!reset || reset.usedAt || reset.expiresAt < new Date() || reset.user.isBanned) {
    return NextResponse.json(
      { error: "رابط إعادة التعيين غير صالح أو منتهي — اطلب رابطاً جديداً" },
      { status: 400 }
    );
  }

  await db.$transaction([
    db.user.update({
      where: { id: reset.userId },
      data: { passwordHash: hashSync(parsed.data.password, 12) },
    }),
    db.passwordResetToken.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
