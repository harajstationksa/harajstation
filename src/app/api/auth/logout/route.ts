import { NextResponse } from "next/server";
import { SESSION_COOKIE, revokeCurrentSession } from "@/lib/auth";

/** Logout revokes the token server-side; `{ "everywhere": true }` ends every session. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { everywhere?: unknown } | null;
  await revokeCurrentSession("site", body?.everywhere === true);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
