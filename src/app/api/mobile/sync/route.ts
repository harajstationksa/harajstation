import { getCurrentUser } from "@/lib/auth";
import { rateLimitGuard } from "@/lib/rate-limit";
import { accountVersion, publicVersions } from "../_lib/sync-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Foreground revision stream. The committed database is checked every three
 * seconds. Short-lived streams reconnect to revalidate the session. Nginx
 * must not buffer these frames; Android falls back when a proxy blocks SSE.
 * `?scope=public` (the website home page) skips the personal fingerprint.
 */
export async function GET(request: Request) {
  // Each stream lives up to 55s, so this also caps concurrent streams per IP.
  const limited = await rateLimitGuard(request, "sync-stream", 30, 60_000);
  if (limited) return limited;
  const publicOnly = new URL(request.url).searchParams.get("scope") === "public";
  const user = publicOnly ? null : await getCurrentUser();
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let close: (() => void) | undefined;
  const started = Date.now();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    request.signal.removeEventListener("abort", stop);
    close?.();
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      close = () => controller.close();
      request.signal.addEventListener("abort", stop, { once: true });
      if (request.signal.aborted) {
        stop();
        return;
      }
      async function tick() {
        if (stopped) return;
        try {
          const [publicState, account] = await Promise.all([
            publicVersions(),
            user ? accountVersion(user.id) : Promise.resolve("guest"),
          ]);
          if (stopped) return;
          controller.enqueue(
            encoder.encode(
              `event: revision\ndata: ${JSON.stringify({ ...publicState, account })}\n\n`,
            ),
          );
        } catch {
          // Do not leak SQL errors or impersonate a fresh snapshot on failure.
          stop();
          return;
        }
        if (Date.now() - started >= 55_000) {
          stop();
          return;
        }
        timer = setTimeout(tick, 3_000);
      }
      void tick();
    },
    cancel() {
      close = undefined;
      stop();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
