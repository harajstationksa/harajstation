import { NextResponse, type NextRequest } from "next/server";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

/**
 * Global burst shield. (Next 16 renamed `middleware` → `proxy`; it runs on
 * the Node.js runtime.) The per-route limiters do the fine-grained work —
 * this is the coarse net in front of everything: it also covers Server
 * Functions, which POST to the page route they live on, and any route added
 * later that forgets its own guard.
 *
 * Page reads are never limited (browsing, prefetch and crawlers must not
 * break) — only writes and API traffic are, at ceilings no human reaches.
 */
const WRITE_LIMIT = 90; // POST/PUT/PATCH/DELETE per IP per minute
const READ_LIMIT = 300; // API GETs per IP per minute (live-bid polling is fine)
const WINDOW = 60_000;

/** Machine callers with their own secret — never throttle them. */
const BYPASS = ["/api/payments/webhook", "/api/cron"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isRead = req.method === "GET" || req.method === "HEAD";

  if (isRead && !pathname.startsWith("/api/")) return NextResponse.next();
  if (BYPASS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const ip = clientIp(req);
  const limited = isRead
    ? await isRateLimited(`burst:read:${ip}`, READ_LIMIT, WINDOW)
    : await isRateLimited(`burst:write:${ip}`, WRITE_LIMIT, WINDOW);

  if (limited) {
    return NextResponse.json(
      { error: "محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
