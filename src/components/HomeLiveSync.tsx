"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Never refresh more often than this, however busy the market is. */
const MIN_REFRESH_GAP_MS = 60_000;
/** Spread refreshes so one change does not re-render every open home page at once. */
const MAX_JITTER_MS = 20_000;

/** Public home content only. Refresh merges RSC while preserving the user's
 * scroll and carousel state; it does not reload forms or navigate away.
 *
 * The first revision frame is the baseline, so rendering the page never waits
 * on the revision query and a missing revision can never cause a refresh loop.
 */
export function HomeLiveSync() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);
  useEffect(() => {
    refreshing.current = pending;
  }, [pending]);

  useEffect(() => {
    let source: EventSource | undefined;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    let baseline: string | null = null;
    let lastRefresh = Date.now();

    const refresh = () => {
      scheduled = undefined;
      if (document.visibilityState !== "visible" || refreshing.current) return;
      refreshing.current = true;
      lastRefresh = Date.now();
      startTransition(() => router.refresh());
    };
    const schedule = () => {
      if (scheduled) return;
      const wait = Math.max(0, lastRefresh + MIN_REFRESH_GAP_MS - Date.now());
      scheduled = setTimeout(refresh, wait + Math.random() * MAX_JITTER_MS);
    };
    const stop = () => {
      source?.close();
      source = undefined;
    };
    const connect = () => {
      stop();
      if (document.visibilityState !== "visible") return;
      source = new EventSource("/api/mobile/sync?scope=public");
      source.addEventListener("revision", (event) => {
        try {
          const value: unknown = JSON.parse((event as MessageEvent).data);
          if (!value || typeof value !== "object" || !("market" in value) || !("catalogue" in value))
            return;
          if (typeof value.market !== "string" || typeof value.catalogue !== "string") return;
          const revision = `${value.catalogue}:${value.market}`;
          if (baseline === null) {
            baseline = revision;
          } else if (revision !== baseline) {
            baseline = revision;
            schedule();
          }
        } catch {
          /* Invalid frames are ignored; the next frame carries the full state. */
        }
      });
      // EventSource reconnects by itself; no polling fallback that could
      // multiply requests while the stream endpoint is struggling.
    };
    const visibility = () => {
      if (document.visibilityState === "visible") connect();
      else stop();
    };
    document.addEventListener("visibilitychange", visibility);
    connect();
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      clearTimeout(scheduled);
      stop();
    };
  }, [router, startTransition]);
  return null;
}
