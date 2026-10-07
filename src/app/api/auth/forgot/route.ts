import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { isRateLimited, rateLimitGuard } from "@/lib/rate-limit";
import { emailConfigured, sendPasswordResetEmail } from "@/lib/email";
import { hashOneTimeToken } from "@/lib/tokens";

const schema = z.object({ email: z.string().email() });

const TOKEN_TTL_MIN = 30;

/**
 * Start the forgot-password flow. Always responds ok (no account
 * enumeration). With SMTP configured the link is emailed; without it
 * (local dev) the link is returned to the client and shown on-screen.
 */
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "forgot", 5, 10 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: apiMessage(req, "أدخل بريداً إلكترونياً صالحاً") },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  // per-address cap so a rotating-IP attacker can't mail-bomb one inbox.
  // Keyed on the *submitted* address and checked before any lookup, so it
  // still reveals nothing about whether the account exists.
  if (await isRateLimited(`forgot:mail:${email}`, 3, 60 * 60_000)) {
    return NextResponse.json(
      { error: apiMessage(req, "طلبت رابط الاستعادة عدة مرات — راجع بريدك أو انتظر ساعة") },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  if (!emailConfigured() && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: apiMessage(req, "خدمة الاستعادة غير متاحة مؤقتًا") },
      { status: 503 },
    );
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.isBanned) {
    // same response shape as success — reveals nothing
    return NextResponse.json({ ok: true });
  }

  // Serialize issuance with password resets and account security changes.
  const token = randomBytes(32).toString("hex");
  const issued = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (
      !current ||
      current.isBanned ||
      current.email !== email ||
      current.sessionVersion !== user.sessionVersion
    )
      return false;
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashOneTimeToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60_000),
      },
    });
    return true;
  });
  if (!issued) return NextResponse.json({ ok: true });

  const resetUrl = `/reset/${token}`;
  if (emailConfigured()) {
    // real delivery — never expose the link in the response
    await sendPasswordResetEmail(email, resetUrl);
    return NextResponse.json({ ok: true });
  }
  // local dev without email keys: hand the link to the UI
  return NextResponse.json({ ok: true, resetUrl });
}
