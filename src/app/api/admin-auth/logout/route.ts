import { NextResponse } from "next/server";
import { ADMIN_COOKIE, revokeCurrentSession } from "@/lib/auth";

/** Logout revokes the portal token server-side, not just the cookie. */
export async function POST() {
  await revokeCurrentSession("admin");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
