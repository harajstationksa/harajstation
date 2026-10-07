"use client";

import { useEffect } from "react";

/** Registers the service worker site-wide (PWA install + Web Push). */
export function PwaRegister() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/admin")) return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    }
  }, []);
  return null;
}
