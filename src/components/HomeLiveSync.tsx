"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Public home content only. Refresh merges RSC while preserving the user's
 * scroll and carousel state; it does not reload forms or navigate away.
 */
export function HomeLiveSync({ revision }: { revision: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);
  useEffect(() => {
    refreshing.current = pending;
  }, [pending]);

  useEffect(() => {
    let source: EventSource | undefined;
    let fallback: ReturnType<typeof setInterval> | undefined;
    const refresh = () => {
      if (document.visibilityState !== "visible" || refreshing.current) return;
      refreshing.current = true;
      startTransition(() => router.refresh());
    };
    const stop = () => {
      source?.close();
      source = undefined;
      clearInterval(fallback);
      fallback = undefined;
    };
    const connect = () => {
      stop();
      if (document.visibilityState !== "visible") return;
      source = new EventSource("/api/mobile/sync");
      source.addEventListener("revision", (event) => {
        try {
          const value: unknown = JSON.parse((event as MessageEvent).data);
          if (
            !value ||
            typeof value !== "object" ||
            !("market" in value) ||
            !("catalogue" in value)
          )
            return;
          if (typeof value.market !== "string" || typeof value.catalogue !== "string") return;
          // Compare with what RSC actually rendered, not the last event. If a
          // second cluster worker still had a warm cache, the next frame retries.
          if (`${value.catalogue}:${value.market}` !== revision) refresh();
        } catch {
          /* Invalid frames are recovered by the next event/fallback. */
        }
      });
      source.onopen = () => {
        clearInterval(fallback);
        fallback = undefined;
      };
      source.onerror = () => {
        if (!fallback) fallback = setInterval(refresh, 5000);
      };
    };
    const visibility = () => {
      connect();
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    connect();
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      stop();
    };
  }, [revision, router, startTransition]);
  return null;
}
