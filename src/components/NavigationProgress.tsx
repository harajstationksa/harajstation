"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Code that navigates with router.push() can announce it with this event. */
export const NAV_START_EVENT = "haraj:navigation-start";
export function announceNavigation() {
  window.dispatchEvent(new Event(NAV_START_EVENT));
}

/**
 * Immediate feedback for every in-site navigation: a thin progress bar at the
 * top and a slight dimming of the page content (via `data-nav-pending` on
 * <html>) from the click until the new page has rendered. Without it a filter
 * click looks ignored for as long as the server takes to answer.
 *
 * Plain same-origin GET forms (search and filter forms) are turned into
 * client-side navigations as well, instead of a full page reload.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const safety = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // the route finished rendering: complete the bar
  useEffect(() => {
    clearInterval(timer.current);
    clearTimeout(safety.current);
    document.documentElement.removeAttribute("data-nav-pending");
    let hide: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      setProgress((p) => (p > 0 ? 100 : 0));
      hide = setTimeout(() => {
        setActive(false);
        setProgress(0);
      }, 220);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(hide);
    };
  }, [pathname, searchParams]);

  useEffect(() => {
    const start = () => {
      clearInterval(timer.current);
      clearTimeout(safety.current);
      setActive(true);
      setProgress(12);
      document.documentElement.setAttribute("data-nav-pending", "");
      // creeps toward 90% and waits there for the real end
      timer.current = setInterval(() => setProgress((p) => p + (90 - p) * 0.12), 200);
      // never leave the page dimmed if a navigation is cancelled
      safety.current = setTimeout(() => {
        clearInterval(timer.current);
        document.documentElement.removeAttribute("data-nav-pending");
        setActive(false);
        setProgress(0);
      }, 12_000);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
        return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin) return;
      // same page (or only a hash change): nothing will render
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };

    const onSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented) return;
      const form = event.target as HTMLFormElement;
      if ((form.method || "get").toLowerCase() !== "get" || form.target) return;
      const action = new URL(form.action || location.href, location.href);
      if (action.origin !== location.origin) return;
      event.preventDefault();
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(form, event.submitter)) {
        if (typeof value === "string") params.append(key, value);
      }
      const next = `${action.pathname}${params.size ? `?${params}` : ""}`;
      if (next === location.pathname + location.search) return;
      start();
      router.push(next);
    };

    window.addEventListener(NAV_START_EVENT, start);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    return () => {
      window.removeEventListener(NAV_START_EVENT, start);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
      clearInterval(timer.current);
      clearTimeout(safety.current);
    };
  }, [router]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      style={{ opacity: active ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      <div
        className="h-full bg-primary-500 shadow-[0_0_8px_rgb(219_119_89/60%)]"
        style={{
          width: `${progress}%`,
          transition: "width 200ms ease",
          marginInlineStart: 0,
        }}
      />
    </div>
  );
}
