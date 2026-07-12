import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitGuard } from "@/lib/rate-limit";
import { emailConfigured, sendPasswordResetEmail } from "@/lib/email";

const schema = z.object({ email: z.string().email() });

const TOKEN_TTL_MIN = 30;

/**
 * Start the forgot-password flow. Always responds ok (no account
 * enumeration). With SMTP configured the link is emailed; without it
 * (local dev) the link is returned to the client and shown on-screen.
 */
export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "forgot", 5, 10 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "أدخل بريداً إلكترونياً صالحاً" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.isBanned) {
    // same response shape as success — reveals nothing
    return NextResponse.json({ ok: true });
  }

  // one active token per user: drop older unused ones
  await db.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });

  const token = randomBytes(32).toString("hex");
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60_000),
    },
  });

  const resetUrl = `/reset/${token}`;
  if (emailConfigured()) {
    // real delivery — never expose the link in the response
    await sendPasswordResetEmail(email, resetUrl);
    return NextResponse.json({ ok: true });
  }
  // local dev without email keys: hand the link to the UI
  return NextResponse.json({ ok: true, resetUrl });
}
