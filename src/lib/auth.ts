import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";

const COOKIE_NAME = "samel_session";
const SESSION_DAYS = 7;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    // refuse to run with a guessable session key in production
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET must be set to a random value of 32+ characters in production"
      );
    }
    return new TextEncoder().encode("samel-insecure-dev-secret");
  }
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  sub: string; // user id
  role: string;
  name: string;
  ver: number;
};

type SessionInput = Omit<SessionPayload, "ver">;

async function currentSessionVersion(userId: string): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true, isBanned: true },
  });
  if (!user || user.isBanned) throw new Error("Cannot sign a session for this user");
  return user.sessionVersion;
}

export async function signSessionToken(payload: SessionInput) {
  const ver = await currentSessionVersion(payload.sub);
  return new SignJWT({ ...payload, ver })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

/* ── Admin-portal session ─────────────────────────────────────────────────
   Completely separate from the site session: its own cookie (scoped to the
   admin subdomain by the browser) and an `aud=admin` claim, so neither token
   is ever accepted where the other belongs. Shorter lifetime on purpose. */

const ADMIN_COOKIE_NAME = "samel_admin";
const ADMIN_SESSION_HOURS = 12;
const ADMIN_AUDIENCE = "admin";

export const ADMIN_COOKIE = ADMIN_COOKIE_NAME;

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ADMIN_SESSION_HOURS * 60 * 60,
};

export async function signAdminToken(payload: SessionInput) {
  const ver = await currentSessionVersion(payload.sub);
  return new SignJWT({ ...payload, ver })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(ADMIN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_HOURS}h`)
    .sign(secret());
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      audience: ADMIN_AUDIENCE,
    });
    const sub = payload.sub as string;
    const ver = Number(payload.ver);
    if (!sub || !Number.isSafeInteger(ver)) return null;
    const user = await db.user.findUnique({
      where: { id: sub },
      select: { role: true, name: true, isBanned: true, sessionVersion: true },
    });
    if (!user || user.isBanned || user.sessionVersion !== ver) return null;
    return { sub, role: user.role, name: user.name, ver };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export const SESSION_COOKIE = COOKIE_NAME;

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    // an admin-portal token can never act as a site session
    if (payload.aud) return null;
    const sub = payload.sub as string;
    const ver = Number(payload.ver);
    if (!sub || !Number.isSafeInteger(ver)) return null;
    // JWTs are intentionally not trusted as the current authorization state.
    // Re-read the small security projection so bans, role changes and session
    // revocation take effect immediately across every API using getSession().
    const user = await db.user.findUnique({
      where: { id: sub },
      select: { role: true, name: true, isBanned: true, sessionVersion: true },
    });
    if (!user || user.isBanned || user.sessionVersion !== ver) return null;
    return { sub, role: user.role, name: user.name, ver };
  } catch {
    return null;
  }
}

/** Full user record for the current session, or null. Banned users get no session. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.isBanned) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Staff gate for the admin portal. Reads ONLY the portal session cookie —
 * a normal site login (even one that used to carry an ADMIN role) can never
 * open an admin page. Set exclusively by /api/admin-auth after email-code 2FA.
 */
export async function requireStaff(roles: string[] = ["ADMIN"]) {
  const session = await getAdminSession();
  if (!session) redirect("/admin-login");
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.isBanned || !roles.includes(user.role)) {
    redirect("/admin-login");
  }
  return user;
}

/** Admin API guard: accepts only the short-lived admin cookie with its OTP-backed audience. */
export async function getAdminCurrentUser(
  roles: string[] = ["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"]
) {
  const session = await getAdminSession();
  if (!session || !roles.includes(session.role)) return null;
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.isBanned || !roles.includes(user.role)) return null;
  return user;
}
