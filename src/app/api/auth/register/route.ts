import { NextResponse } from "next/server";
import { z } from "zod";
import { hashSync } from "bcryptjs";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
} from "@/lib/auth";
import { isValidDisplayName } from "@/lib/utils";
import { CITIES } from "@/lib/constants";
import { rateLimitGuard } from "@/lib/rate-limit";

// Email-first registration (phase 1). Phone is optional and added later from
// account settings; the schema already carries phoneVerified for future
// SMS-OTP gating of sensitive actions (auctions, stores, bulk listings).
const schema = z.object({
  name: z.string().min(2).max(60),
  email: z.email(),
  // enum guard: keeps mojibake ("??????") and free-text out of the DB
  city: z.enum(CITIES),
  password: z.string().min(8).max(100),
  acceptTerms: z.literal(true),
});

const AVATAR_COLORS = [
  "#db7759", "#0ea5e9", "#8b5cf6", "#10b981",
  "#ec4899", "#f59e0b", "#14b8a6", "#6366f1",
];

export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "register", 5, 10 * 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const termsIssue = parsed.error.issues.some((i) => i.path[0] === "acceptTerms");
    return NextResponse.json(
      {
        error: termsIssue
          ? "يجب الموافقة على الشروط والأحكام لإنشاء الحساب"
          : "يرجى التحقق من البيانات المدخلة",
      },
      { status: 400 }
    );
  }

  if (!isValidDisplayName(parsed.data.name)) {
    return NextResponse.json(
      { error: "الاسم يجب أن يحتوي حروفاً حقيقية (عربية أو إنجليزية)" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json(
      { error: "هذا البريد الإلكتروني مسجل مسبقاً" },
      { status: 409 }
    );
  }

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email,
      city: parsed.data.city,
      passwordHash: hashSync(parsed.data.password, 12),
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    },
  });

  const token = await signSessionToken({
    sub: user.id,
    role: user.role,
    name: user.name,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
