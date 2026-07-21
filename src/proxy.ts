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

/**
 * When ADMIN_HOST is set (production: haraj-ad.harajstation.com) the admin
 * portal exists ONLY on that host and the main site loses it entirely:
 *   admin host → only /admin*, /admin-login and /api/admin-auth* (plus assets)
 *   main host  → those same paths 404 as if they never existed
 * Unset (local dev) → no host split, everything reachable as before.
 */
const ADMIN_HOST = process.env.ADMIN_HOST;
const ADMIN_PATHS = ["/admin", "/admin-login", "/api/admin-auth"];

function isAdminPath(pathname: string) {
  return ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isRead = req.method === "GET" || req.method === "HEAD";

  if (ADMIN_HOST) {
    const host = (req.headers.get("host") ?? "").split(":")[0];
    if (host === ADMIN_HOST) {
      if (pathname === "/") {
        return NextResponse.redirect(new URL("/admin", req.url));
      }
      if (pathname === "/robots.txt") {
        return new NextResponse("User-agent: *\nDisallow: /\n", {
          headers: { "Content-Type": "text/plain" },
        });
      }
      const allowed =
        isAdminPath(pathname) ||
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico" ||
        pathname === "/logo.png";
      if (!allowed) {
        return new NextResponse("Not found", { status: 404 });
      }
    } else if (isAdminPath(pathname)) {
      // the admin portal does not exist on the public site
      return new NextResponse("Not found", { status: 404 });
    }
  }

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
