"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

// Solid symbols stay legible against the light dock and warm active state.
function NavIcon({ name, className }: { name: IconName; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {name === "home" && (
        <path d="M12 2.5a1.8 1.8 0 0 0-1.16.42l-8 6.75a1.5 1.5 0 0 0-.54 1.15v8.08A2.1 2.1 0 0 0 4.4 21h5.2v-6.1a2.4 2.4 0 0 1 4.8 0V21h5.2a2.1 2.1 0 0 0 2.1-2.1v-8.08a1.5 1.5 0 0 0-.54-1.15l-8-6.75A1.8 1.8 0 0 0 12 2.5Z" />
      )}
      {name === "auctions" && (
        <>
          <path d="m11.28 2.57 2.48 2.48a1.35 1.35 0 0 1-1.91 1.91L9.37 4.48a1.35 1.35 0 0 1 1.91-1.91ZM4.48 9.37l2.48 2.48a1.35 1.35 0 0 1-1.91 1.91l-2.48-2.48a1.35 1.35 0 0 1 1.91-1.91Z" />
          <path d="m8.47 5.38 7.15 7.15-3.09 3.09-7.15-7.15a1.3 1.3 0 0 1 0-1.84l1.25-1.25a1.3 1.3 0 0 1 1.84 0Z" />
          <path d="m13.28 13.28 1.8-1.8 6.25 6.25a1.27 1.27 0 0 1-1.8 1.8l-6.25-6.25ZM3.5 19h12a2 2 0 0 1 2 2v.5h-16V21a2 2 0 0 1 2-2Z" />
        </>
      )}
      {name === "listings" && (
        <>
          <rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2" />
          <rect x="13" y="2.5" width="8.5" height="8.5" rx="2" />
          <rect x="2.5" y="13" width="8.5" height="8.5" rx="2" />
          <rect x="13" y="13" width="8.5" height="8.5" rx="2" />
        </>
      )}
      {name === "account" && (
        <>
          <circle cx="12" cy="7.5" r="4.25" />
          <path d="M12 13.5c-5.1 0-8.5 2.7-8.5 6.05A1.95 1.95 0 0 0 5.45 21h13.1a1.95 1.95 0 0 0 1.95-1.45c0-3.35-3.4-6.05-8.5-6.05Z" />
        </>
      )}
      {name === "sell" && (
        <path d="M12 4a1.2 1.2 0 0 1 1.2 1.2v5.6h5.6a1.2 1.2 0 1 1 0 2.4h-5.6v5.6a1.2 1.2 0 1 1-2.4 0v-5.6H5.2a1.2 1.2 0 1 1 0-2.4h5.6V5.2A1.2 1.2 0 0 1 12 4Z" />
      )}
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

  const items: { href: string; label: string; icon: IconName; primary?: boolean }[] = [
    { href: "/", label: t.nav.home, icon: "home" },
    { href: "/auctions", label: t.nav.auctions, icon: "auctions" },
    { href: "/sell", label: "", icon: "sell", primary: true },
    { href: "/listings", label: t.nav.listings, icon: "listings" },
    { href: "/dashboard", label: t.nav.account, icon: "account" },
  ];
  return (
    <nav
      aria-label={lang === "ar" ? "التنقل الرئيسي" : "Main navigation"}
      className="fixed bottom-0 inset-x-0 z-40 md:hidden px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pointer-events-none"
    >
      <div className={cn(styles.dock, shrunk && styles.compact)}>
        <div className={styles.items}>
          {items.map(({ href, label, icon, primary }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            if (primary) {
              return (
                <Link
                  key={href}
                  href={href}
                  className={styles.addLink}
                  aria-label={lang === "ar" ? "أضف إعلان" : "Post an ad"}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={styles.addButton}>
                    <NavIcon name={icon} className="size-6" />
                  </span>
                  <NavigationHint />
                </Link>
              );
            }
            return (
              <Link
                key={href}
                href={href}
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
      </div>
    </nav>
  );
}
