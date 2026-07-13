import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
} from "@/lib/auth";
import { googleConfigured } from "@/lib/google-oauth";
import { rateLimitGuard } from "@/lib/rate-limit";

/**
 * Social sign-in entry point — Google only.
 *
 * With GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET set, this hands off to the real
 * OAuth flow (google/start -> Google -> google/callback).
 *
 * Without them there is a local-dev shortcut that provisions a fixed account so
 * the button can be exercised offline. It is refused in production: signing
 * anyone who clicks the button into a shared account would be an open door.
 */
const schema = z.object({
  provider: z.literal("google"),
});

const AVATAR_COLORS = ["#db7759", "#0ea5e9", "#8b5cf6", "#10b981", "#ec4899"];

export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "social-login", 10, 10 * 60_000);
  if (limited) return limited;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "مزوّد غير مدعوم" }, { status: 400 });
  }

  if (googleConfigured()) {
    return NextResponse.json({ redirect: "/api/auth/social/google/start" });
  }

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "تسجيل الدخول عبر Google غير مفعّل حالياً — استخدم البريد وكلمة المرور" },
      { status: 503 }
    );
  }

  // ── local dev only: no OAuth credentials present ──
  const email = "google.user@samel.social";
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: {
        name: "مستخدم Google",
        email,
        city: "الرياض",
        passwordHash: `oauth:google:${crypto.randomUUID()}`,
        avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      },
    });
  }
  if (user.isBanned) {
    return NextResponse.json({ error: "هذا الحساب محظور." }, { status: 403 });
  }

  const token = await signSessionToken({
    sub: user.id,
    role: user.role,
    name: user.name,
  });
  const res = NextResponse.json({ ok: true, demo: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
