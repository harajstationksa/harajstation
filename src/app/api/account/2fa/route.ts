import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { rateLimitGuard } from "@/lib/rate-limit";

const schema = z.object({ enabled: z.boolean() });

/** Toggle email 2FA (a one-time code mailed on every login). */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "2fa-toggle", 10, 10 * 60_000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const { enabled } = parsed.data;

  // the codes arrive by mail — enabling without a working, confirmed inbox
  // would lock the account out instead of protecting it
  if (enabled && (!emailConfigured() || !user.emailVerifiedAt)) {
    return NextResponse.json(
      { error: "فعّل بريدك الإلكتروني أولاً حتى تصلك رموز الدخول" },
      { status: 400 }
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: { twoFactorEmail: enabled },
  });
  // closing the door behind us: no half-finished challenges survive a toggle
  await db.loginOtp.deleteMany({ where: { userId: user.id } });

  return NextResponse.json({ ok: true, enabled });
}
