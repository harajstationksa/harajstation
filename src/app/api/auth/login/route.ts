import { NextResponse } from "next/server";
import { z } from "zod";
import { compareSync } from "bcryptjs";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
} from "@/lib/auth";
import { normalizeSaudiPhone } from "@/lib/utils";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({
  identifier: z.string().min(3), // phone or email
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "login", 8, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const { identifier, password } = parsed.data;
  const phone = normalizeSaudiPhone(identifier);
  const user = await db.user.findFirst({
    where: phone ? { phone } : { email: identifier.toLowerCase() },
  });

  if (!user || !compareSync(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "بيانات الدخول غير صحيحة" },
      { status: 401 }
    );
  }
  if (user.isBanned) {
    return NextResponse.json(
      { error: "هذا الحساب محظور. تواصل مع الدعم." },
      { status: 403 }
    );
  }

  const token = await signSessionToken({
    sub: user.id,
    role: user.role,
    name: user.name,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
