import { apiMessage } from "@/lib/api-messages";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/constants";
import { rateLimitGuard, isRateLimited } from "@/lib/rate-limit";
import { startOtpChallenge } from "@/lib/login-otp";
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "admin-forgot", 5, 600000);
  if (limited) return limited;
  const parsed = z
    .object({ email: z.email().max(254) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: apiMessage(req, "أدخل بريدًا صالحًا") }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  let challenge = randomBytes(32).toString("hex");
  if (!(await isRateLimited(`admin-forgot:${email}`, 3, 3600000))) {
    const user = await db.user.findFirst({
      where: { email, role: { in: STAFF_ROLES }, isBanned: false },
    });
    if (user) {
      const result = await startOtpChallenge(user, "ADMIN_RESET");
      if (result.ok) challenge = result.challenge;
    }
  }
  return NextResponse.json({ ok: true, challenge });
}
