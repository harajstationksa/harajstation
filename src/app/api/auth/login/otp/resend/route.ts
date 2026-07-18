import { NextResponse } from "next/server";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { isRateLimited, rateLimitGuard } from "@/lib/rate-limit";
import { sendLoginCodeEmail } from "@/lib/email";
import {
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  hashOtp,
} from "@/lib/login-guard";

const schema = z.object({ challenge: z.string().length(64) });

/**
 * Re-mail the login code for a still-open challenge. The challenge itself
 * proves the password step passed. Quota guards: 60s cooldown per challenge,
 * 6 sends/hour per account, plus the global per-inbox cap in sendEmail.
 */
export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "login-otp-resend", 6, 10 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const otp = await db.loginOtp.findUnique({
    where: { challenge: parsed.data.challenge },
    include: { user: true },
  });
  if (!otp || otp.consumedAt) {
    return NextResponse.json(
      { error: "انتهت صلاحية الرمز — ارجع وسجّل دخولك من جديد", restart: true },
      { status: 400 }
    );
  }
  const sinceLast = Date.now() - otp.lastSentAt.getTime();
  if (sinceLast < OTP_RESEND_COOLDOWN_MS) {
    return NextResponse.json(
      {
        error: `على هونك 😄 الرمز انرسل قبل شوي — جرّب بعد ${Math.ceil(
          (OTP_RESEND_COOLDOWN_MS - sinceLast) / 1000
        )} ثانية`,
      },
      { status: 429 }
    );
  }
  if (isRateLimited(`otp-send:${otp.userId}`, 6, 60 * 60_000)) {
    return NextResponse.json(
      { error: "طلبت رموزاً كثيرة خلال ساعة — هدّئ عليك شوي وحاول بعدين 😉" },
      { status: 429 }
    );
  }

  const code = String(randomInt(100000, 1000000));
  await db.loginOtp.update({
    where: { id: otp.id },
    data: {
      codeHash: hashOtp(code, otp.challenge),
      attempts: 0,
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  const sent = await sendLoginCodeEmail(otp.user.email, code);
  if (!sent) {
    return NextResponse.json(
      { error: "تعذّر إرسال رمز التحقق — حاول بعد قليل" },
      { status: 429 }
    );
  }
  return NextResponse.json({ ok: true });
}
