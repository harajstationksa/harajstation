import { apiMessage } from "@/lib/api-messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/constants";
import { clientIp, rateLimitGuard } from "@/lib/rate-limit";
import { maskEmail, startOtpChallenge } from "@/lib/login-otp";
import {
  FAIL_WINDOW_MS,
  ACCOUNT_LOCK_AFTER,
  LOCK_MINUTES,
  ghostFailure,
  ghostLock,
  loginPairKey,
  pairFailure,
  pairLock,
  pairReset,
  lockedError,
  lockNowError,
  teaseFor,
} from "@/lib/login-guard";
export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "admin-login", 8, 60000);
  if (limited) return limited;
  const parsed = z
    .object({
      email: z.email().max(254),
      password: z.string().max(100).optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: apiMessage(req, "بيانات غير صالحة") }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase(),
    password = parsed.data.password;
  const found = await db.user.findFirst({
    where: { email, role: { in: STAFF_ROLES } },
    select: {
      id: true,
      passwordHash: true,
      passwordEnabled: true,
      sessionVersion: true,
    },
  });
  const pairKey = loginPairKey(found ? found.id : `admin:${email}`, clientIp(req));
  if (!found) {
    const lock = await ghostLock(pairKey);
    if (lock)
      return NextResponse.json(
        { error: apiMessage(req, lockedError(lock)), locked: true },
        { status: 423 },
      );
    if (!password) return NextResponse.json({ needPassword: true });
    const verdict = await ghostFailure(pairKey);
    return NextResponse.json(
      { error: apiMessage(req, verdict.error), locked: !!verdict.lockedUntil },
      { status: verdict.lockedUntil ? 423 : 401 },
    );
  }
  // Password work happens before row locking; locked writes only commit against the checked credential version.
  // Locks are per (account, network) so nobody can lock staff out from outside;
  // the account-wide lock below only engages after distributed guessing.
  const networkLock = await pairLock(pairKey);
  if (networkLock)
    return NextResponse.json(
      { error: apiMessage(req, lockedError(networkLock)), locked: true },
      { status: 423 },
    );
  const passwordMatches =
    found.passwordEnabled && password ? await compare(password, found.passwordHash) : false;
  const networkVerdict =
    found.passwordEnabled && password && !passwordMatches ? await pairFailure(pairKey) : null;
  const verdict = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${found.id} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: found.id } }),
      now = new Date();
    if (user.isBanned || !STAFF_ROLES.includes(user.role))
      return {
        response: NextResponse.json(
          { error: apiMessage(req, "لا يمكن الدخول بهذا الحساب") },
          { status: 403 },
        ),
      };
    if (user.lockUntil && user.lockUntil > now)
      return {
        response: NextResponse.json(
          { error: apiMessage(req, lockedError(user.lockUntil)), locked: true },
          { status: 423 },
        ),
      };
    if (user.passwordEnabled && !password)
      return { response: NextResponse.json({ needPassword: true }) };
    if (
      user.sessionVersion !== found.sessionVersion ||
      user.passwordHash !== found.passwordHash ||
      user.passwordEnabled !== found.passwordEnabled
    )
      return {
        response: NextResponse.json(
          { error: apiMessage(req, "تغيرت بيانات الدخول؛ أعد المحاولة") },
          { status: 409 },
        ),
      };
    if (user.passwordEnabled && !passwordMatches) {
      const stale =
        (user.lastFailedAt && now.getTime() - user.lastFailedAt.getTime() > FAIL_WINDOW_MS) ||
        (user.lockUntil && user.lockUntil <= now);
      const count = (stale ? 0 : user.failedLogins) + 1;
      const accountLocked = count >= ACCOUNT_LOCK_AFTER;
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLogins: accountLocked ? 0 : count,
          lastFailedAt: now,
          lockUntil: accountLocked ? new Date(now.getTime() + LOCK_MINUTES * 60000) : null,
        },
      });
      const locked = accountLocked || !!networkVerdict?.lockedUntil;
      return {
        response: NextResponse.json(
          {
            error: apiMessage(
              req,
              accountLocked
                ? lockNowError()
                : (networkVerdict?.error ?? teaseFor(count).error),
            ),
            locked,
          },
          { status: locked ? 423 : 401 },
        ),
      };
    }
    await tx.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lastFailedAt: null, lockUntil: null },
    });
    return { user };
  });
  if (verdict.response) return verdict.response;
  if (passwordMatches) await pairReset(pairKey);
  const otp = await startOtpChallenge(verdict.user!, "ADMIN_LOGIN");
  if (!otp.ok) return NextResponse.json({ error: apiMessage(req, otp.error) }, { status: 503 });
  return NextResponse.json({
    requiresOtp: true,
    challenge: otp.challenge,
    email: maskEmail(verdict.user!.email),
    totp: !!verdict.user!.totpEnabledAt,
  });
}
