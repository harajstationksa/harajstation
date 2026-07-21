import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ADMIN_COOKIE, adminCookieOptions, signAdminToken } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";
import { rateLimitGuard } from "@/lib/rate-limit";
import { OTP_MAX_ATTEMPTS, hashOtp } from "@/lib/login-guard";
import { safeEqual } from "@/lib/crypto";

const schema = z.object({
  challenge: z.string().length(64),
  code: z.string().regex(/^\d{6}$/, "الرمز 6 أرقام"),
});

/** Admin login, step 2: exchange challenge + emailed code for a PORTAL session. */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "admin-login-otp", 15, 10 * 60_000);
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
    otp.attempts >= OTP_MAX_ATTEMPTS ||
    // a site-login challenge can never open the admin portal
    !STAFF_ROLES.includes(otp.user.role)
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
    return NextResponse.json({ error: "هذا الحساب موقوف" }, { status: 403 });
  }

  await db.loginOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
  await db.auditLog.create({
    data: { actorId: otp.user.id, action: "ADMIN_LOGIN", detail: otp.user.email },
  });

  const token = await signAdminToken({
    sub: otp.user.id,
    role: otp.user.role,
    name: otp.user.name,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions);
  return res;
}
