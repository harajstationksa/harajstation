import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
} from "@/lib/auth";
import { rateLimitGuard } from "@/lib/rate-limit";
import { OTP_MAX_ATTEMPTS, hashOtp } from "@/lib/login-guard";
import { safeEqual } from "@/lib/crypto";

const schema = z.object({
  challenge: z.string().length(64),
  code: z.string().regex(/^\d{6}$/, "الرمز 6 أرقام"),
});

/** Second login step: exchange challenge + emailed code for a session. */
export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "login-otp", 15, 10 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const { challenge, code } = parsed.data;

  const otp = await db.loginOtp.findUnique({
    where: { challenge },
    include: { user: true },
  });
  if (
    !otp ||
    otp.consumedAt ||
    otp.expiresAt < new Date() ||
    otp.attempts >= OTP_MAX_ATTEMPTS
  ) {
    return NextResponse.json(
      { error: "انتهت صلاحية الرمز — ارجع وسجّل دخولك من جديد", restart: true },
      { status: 400 }
    );
  }

  if (!safeEqual(hashOtp(code, challenge), otp.codeHash)) {
    const attempts = otp.attempts + 1;
    await db.loginOtp.update({ where: { id: otp.id }, data: { attempts } });
    const left = OTP_MAX_ATTEMPTS - attempts;
    if (left <= 0) {
      return NextResponse.json(
        { error: "خلصت المحاولات على هذا الرمز — ارجع وسجّل دخولك من جديد", restart: true },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: `الرمز غير صحيح — باقي ${left} ${left === 1 ? "محاولة" : "محاولات"}` },
      { status: 401 }
    );
  }

  if (otp.user.isBanned) {
    return NextResponse.json(
      { error: "هذا الحساب محظور. تواصل مع الدعم." },
      { status: 403 }
    );
  }

  await db.loginOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });

  const token = await signSessionToken({
    sub: otp.user.id,
    role: otp.user.role,
    name: otp.user.name,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
