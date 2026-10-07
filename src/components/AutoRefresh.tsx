"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Silently re-fetches server data on an interval (live admin panels). */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
