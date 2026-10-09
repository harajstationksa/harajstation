import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { randomBytes, randomUUID } from "node:crypto";
import { isSessionTokenRevoked, revokeSessionToken } from "./session-revocation";
import { STAFF_ROLES } from "./constants";
import { canUseStaffGate, type StaffPermission } from "./staff-permissions";

const COOKIE_NAME = "samel_session";
const SESSION_DAYS = 7;

const SESSION_ISSUER = "harajstation";
const devKeys = { site: randomBytes(32), admin: randomBytes(32) };
function secret(kind: "site" | "admin" = "site") {
  const key = kind === "admin" ? "ADMIN_AUTH_SECRET" : "AUTH_SECRET";
  const s = process.env[key];
  if (!s || s.length < 32) {
    // refuse to run with a guessable session key in production
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${key} must be set to a random value of 32+ characters in production`);
    }
    return devKeys[kind];
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

export async function signSessionToken(payload: SessionInput, verifiedVersion?: number) {
  const ver = verifiedVersion ?? (await currentSessionVersion(payload.sub));
  if (!Number.isSafeInteger(ver) || ver < 0) throw new Error("Invalid verified session version");
  return new SignJWT({ ...payload, ver })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SESSION_ISSUER)
    .setAudience("site")
    .setIssuedAt()
    .setJti(randomUUID())
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
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ADMIN_SESSION_HOURS * 60 * 60,
};

export async function signAdminToken(payload: SessionInput, verifiedVersion?: number) {
  const ver = verifiedVersion ?? (await currentSessionVersion(payload.sub));
  if (!Number.isSafeInteger(ver) || ver < 0) throw new Error("Invalid verified session version");
  return new SignJWT({ ...payload, ver })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(ADMIN_AUDIENCE)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${ADMIN_SESSION_HOURS}h`)
    .sign(secret("admin"));
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret("admin"), {
      audience: ADMIN_AUDIENCE,
      issuer: SESSION_ISSUER,
      algorithms: ["HS256"],
    });
    const sub = payload.sub as string;
    const ver = Number(payload.ver);
    if (!sub || !Number.isSafeInteger(ver)) return null;
    if (await isSessionTokenRevoked(payload.jti)) return null;
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
    const { payload } = await jwtVerify(token, secret(), {
      issuer: SESSION_ISSUER,
      audience: "site",
      algorithms: ["HS256"],
    });
    const sub = payload.sub as string;
    const ver = Number(payload.ver);
    if (!sub || !Number.isSafeInteger(ver)) return null;
    if (await isSessionTokenRevoked(payload.jti)) return null;
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
export async function requireStaff(roles: string[] = ["ADMIN"], permission?: StaffPermission) {
  const session = await getAdminSession();
  if (!session) redirect("/admin-login");
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (
    !user ||
    user.isBanned ||
    user.sessionVersion !== session.ver ||
    !STAFF_ROLES.includes(user.role)
  ) {
    redirect("/admin-login");
  }
  if (!canUseStaffGate(user, roles, permission)) redirect("/admin/forbidden");
  return user;
}

/** Admin API guard: accepts only the short-lived admin cookie with its OTP-backed audience. */
export async function getAdminCurrentUser(
  roles: string[] = STAFF_ROLES,
  permission?: StaffPermission,
) {
  const session = await getAdminSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (
    !user ||
    user.isBanned ||
    user.sessionVersion !== session.ver ||
    !canUseStaffGate(user, roles, permission)
  )
    return null;
  return user;
}

/**
 * Revoke the session token carried by this request (logout). With
 * `everywhere`, every session of the account is ended by bumping its version.
 */
export async function revokeCurrentSession(kind: "site" | "admin", everywhere = false) {
  const store = await cookies();
  const token = store.get(kind === "admin" ? ADMIN_COOKIE_NAME : COOKIE_NAME)?.value;
  if (!token) return;
  try {
    const { payload } = await jwtVerify(token, secret(kind), {
      issuer: SESSION_ISSUER,
      audience: kind === "admin" ? ADMIN_AUDIENCE : "site",
      algorithms: ["HS256"],
    });
    if (payload.jti && payload.exp) await revokeSessionToken(payload.jti, payload.exp);
    if (everywhere && payload.sub) {
      await db.user.update({
        where: { id: payload.sub },
        data: { sessionVersion: { increment: 1 } },
      });
    }
  } catch {
    /* an invalid or expired token has nothing left to revoke */
  }
}
