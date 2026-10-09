"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLang } from "./LangProvider";
import styles from "./BottomNav.module.css";

type IconName = "home" | "auctions" | "sell" | "listings" | "account";

function NavigationHint() {
  const { pending } = useLinkStatus();
  const { lang } = useLang();
  return (
    <span className={styles.navigationHint} data-pending={pending} role="status">
      {pending && (
        <span className="sr-only">{lang === "ar" ? "جارٍ الانتقال" : "Opening page"}</span>
      )}
    </span>
  );
}

// Outline symbols read clearly through the glass; the active one is tinted.
function NavIcon({ name, className }: { name: IconName; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {name === "home" && (
        <path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-6h-5.6v6H5A1.5 1.5 0 0 1 3.5 19z" />
      )}
      {name === "auctions" && (
        <path d="m14.5 3.5 6 6M10 8l6 6M12.2 5.8l6 6-3.4 3.4-6-6zM8.8 12.6 3.5 17.9a1.6 1.6 0 0 0 2.3 2.3l5.3-5.3M13 21h8" />
      )}
      {name === "listings" && (
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
        </>
      )}
      {name === "account" && (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20.5c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5" />
        </>
      )}
      {name === "sell" && <path d="M12 5v14M5 12h14" strokeWidth={2.6} />}
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { lang, t } = useLang();
  const [shrunk, setShrunk] = useState(false);

  useEffect(() => {
    const scrollPosition = () =>
      Math.max(
        0,
        Math.min(
          window.scrollY,
          Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        ),
      );
    let lastY = scrollPosition();
    let direction = 0;
    let distance = 0;
    let compact = false;
    let frame = 0;
    // A new page starts expanded; cancel pending work on navigation/unmount.
    const resetFrame = requestAnimationFrame(() => setShrunk(false));
    const update = () => {
      frame = 0;
      const y = scrollPosition();
      const delta = y - lastY;
      lastY = y;
      if (y <= 24) {
        distance = 0;
        direction = 0;
        compact = false;
        setShrunk(false);
        return;
      }
      if (delta === 0) return;
      const nextDirection = Math.sign(delta);
      distance = nextDirection === direction ? distance + Math.abs(delta) : Math.abs(delta);
      direction = nextDirection;
      // Accumulate small wheel/touch movements, but ignore brief direction jitters.
      const shouldShrink = direction > 0;
      if (distance < (shouldShrink ? 32 : 24) || (shouldShrink && y < 96)) return;
      distance = 0;
      if (compact !== shouldShrink) {
        compact = shouldShrink;
        setShrunk(compact);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resetFrame);
    };
  }, [pathname]);

  const items: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: t.nav.home, icon: "home" },
    { href: "/auctions", label: t.nav.auctions, icon: "auctions" },
    { href: "/listings", label: t.nav.listings, icon: "listings" },
    { href: "/dashboard", label: t.nav.account, icon: "account" },
  ];
  const activeIndex = items.findIndex(({ href }) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href),
  );

  // The glass lens slides under the active tab. Measured from the rendered
  // tabs so it follows RTL/LTR, label visibility and the compact state.
  const dockRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [lens, setLens] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const lastIndex = useRef(activeIndex);
  useLayoutEffect(() => {
    const place = () => {
      const tab = tabRefs.current[activeIndex];
      if (!tab) return setLens(null);
      setLens({ x: tab.offsetLeft, y: tab.offsetTop, w: tab.offsetWidth, h: tab.offsetHeight });
    };
    place();
    const dock = dockRef.current;
    if (!dock) return;
    const observer = new ResizeObserver(place);
    observer.observe(dock);
    dock.addEventListener("transitionend", place);
    return () => {
      observer.disconnect();
      dock.removeEventListener("transitionend", place);
    };
  }, [activeIndex, shrunk]);
  useEffect(() => {
    if (lastIndex.current === activeIndex) return;
    lastIndex.current = activeIndex;
    setMoving(true);
    const id = setTimeout(() => setMoving(false), 560);
    return () => clearTimeout(id);
  }, [activeIndex]);

  const sellActive = pathname.startsWith("/sell");
  return (
    <nav
      aria-label={lang === "ar" ? "التنقل الرئيسي" : "Main navigation"}
      className="fixed bottom-0 inset-x-0 z-40 md:hidden px-3.5 pb-[max(env(safe-area-inset-bottom),0.85rem)] pointer-events-none"
    >
      <div className={cn(styles.bar, shrunk && styles.compact)}>
        <div ref={dockRef} className={cn(styles.dock, styles.glass)}>
          <span
            aria-hidden="true"
            className={cn(styles.lens, moving && styles.lensMoving)}
            style={
              lens
                ? {
                    width: lens.w,
                    height: lens.h,
                    top: lens.y,
                    transform: `translateX(${lens.x}px)`,
                    opacity: 1,
                  }
                : { opacity: 0 }
            }
          />
          {items.map(({ href, label, icon }, i) => {
            const active = i === activeIndex;
            return (
              <Link
                key={href}
                href={href}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                className={cn(styles.item, active && styles.active)}
                aria-label={label}
                aria-current={active ? "page" : undefined}
              >
                <NavIcon name={icon} className={styles.icon} />
                <span className={styles.label}>{label}</span>
                <NavigationHint />
              </Link>
            );
          })}
        </div>
        <Link
          href="/sell"
          className={styles.sell}
          aria-label={lang === "ar" ? "أضف إعلان" : "Post an ad"}
          aria-current={sellActive ? "page" : undefined}
        >
          <NavIcon name="sell" className={styles.sellIcon} />
          <NavigationHint />
        </Link>
      </div>
    </nav>
  );
}
