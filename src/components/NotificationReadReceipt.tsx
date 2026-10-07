"use client";
import { useEffect } from "react";
import { clientFetch } from "@/lib/client-fetch";

/** Runs after hydration on a visible page, never during a server prefetch. */
export function NotificationReadReceipt({ ids }: { ids: string[] }) {
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let sent = false;
    const mark = async () => {
      if (document.visibilityState !== "visible" || sent) return;
      sent = true;
      const result = await clientFetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: key.split(",") }),
      });
      if (!result.ok) sent = false;
      else window.dispatchEvent(new Event("notifications-read"));
    };
    void mark();
    document.addEventListener("visibilitychange", mark);
    window.addEventListener("online", mark);
    return () => {
      document.removeEventListener("visibilitychange", mark);
      window.removeEventListener("online", mark);
    };
  }, [key]);
  return null;
}
