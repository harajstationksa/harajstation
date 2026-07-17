"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

const POLL_MS = 30_000;

/**
 * Header bell with a live unread badge. The count is server-rendered once
 * (`initialUnread`), then kept fresh without a page reload: refetched every
 * 30s while the tab is visible, and immediately when the tab regains focus.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    let stopped = false;

    async function refresh() {
      try {
        const res = await fetch("/api/notifications/count", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: number };
        if (!stopped && typeof data.unread === "number") {
          setUnread(data.unread);
        }
      } catch {
        // transient network failure — keep the last known count
      }
    }

    // hidden tabs skip polling (no point burning requests in background)
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return (
    <Link
      href="/dashboard/notifications"
      className="relative size-9 rounded-full border border-neutral-200 hover:bg-neutral-50 transition-colors flex items-center justify-center"
      aria-label="الإشعارات"
    >
      <Bell className="size-4.5 text-neutral-500" />
      {unread > 0 && (
        <span className="absolute -top-1 -left-1 size-4.5 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
