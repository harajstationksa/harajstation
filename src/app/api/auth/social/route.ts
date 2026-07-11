import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
} from "@/lib/auth";

/**
 * Social sign-in entry point — Google only.
 *
 * Production: swap the demo-provisioning block for a redirect to Google's
 * OAuth consent screen, then verify the returned id_token in the callback and
 * upsert the user by verified email. Needs GOOGLE_CLIENT_ID +
 * GOOGLE_CLIENT_SECRET; when they're absent (dev/demo) we provision a
 * deterministic account so the whole flow is exercisable end-to-end.
 */
const schema = z.object({
  provider: z.literal("google"),
});

const AVATAR_COLORS = ["#db7759", "#0ea5e9", "#8b5cf6", "#10b981", "#ec4899"];

function googleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "مزوّد غير مدعوم" }, { status: 400 });
  }

  if (googleConfigured()) {
    // Real OAuth is configured — hand off to Google's consent screen.
    // (Callback route verifies id_token and upserts the user.)
    return NextResponse.json({ redirect: "/api/auth/social/google/start" });
  }

  // ── Demo provisioning (no OAuth creds present) ──
  const email = "google.user@samel.social";
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: {
        name: "مستخدم Google",
        email,
        city: "الرياض",
        // random unusable password — social accounts sign in via provider only
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
