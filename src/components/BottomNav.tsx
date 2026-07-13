"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gavel, Home, LayoutGrid, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "./LangProvider";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLang();

  const items = [
    { href: "/", label: t.nav.home, icon: Home },
    { href: "/auctions", label: t.nav.auctions, icon: Gavel },
    { href: "/sell", label: "", icon: Plus, primary: true },
    { href: "/listings", label: t.nav.listings, icon: LayoutGrid },
    { href: "/dashboard", label: t.nav.account, icon: User },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pointer-events-none">
      {/*
        Liquid glass: the material is thin and heavily saturated so the page
        colours bleed through it, and the edge carries a specular highlight —
        bright along the top rim, fading as it wraps around. That rim is what
        reads as "glass" rather than "translucent plastic"; blur alone doesn't.
      */}
      <div
        className="pointer-events-auto relative isolate mx-auto max-w-sm rounded-[1.75rem]
                   bg-white/72 backdrop-blur-2xl backdrop-saturate-[1.8]
                   shadow-[0_10px_40px_-8px_rgba(0,0,0,0.28),0_2px_8px_-2px_rgba(0,0,0,0.12)]"
      >
        {/* specular sheen — light gathers at the top edge and falls away */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[1.75rem]
                     bg-gradient-to-b from-white/70 via-white/15 to-white/5"
        />
        {/* rim: a hairline of light inside the top edge, shadow inside the bottom */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[1.75rem] ring-1 ring-inset ring-white/50
                     shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),inset_0_-1px_2px_rgba(0,0,0,0.06)]"
        />
        <div className="relative flex items-center justify-around h-16 px-2">
          {items.map(({ href, label, icon: Icon, primary }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            if (primary) {
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-center px-1"
                  aria-label="أضف إعلان"
                >
                  <span className="size-12 rounded-full bg-gradient-to-b from-primary-400 to-primary-600 text-white shadow-lg shadow-primary-500/40 ring-1 ring-inset ring-white/50 flex items-center justify-center active:scale-95 transition-transform">
                    <Plus className="size-6" />
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center justify-center gap-1 px-1 min-w-14"
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full px-4 py-1 transition-all duration-200",
                    active
                      ? // a brighter lens sitting on the same glass, not an opaque chip
                        "bg-white/90 text-primary-600 ring-1 ring-inset ring-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.9)]"
                      : "text-neutral-600"
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span
                  className={cn(
                    "text-[10px] leading-none transition-colors",
                    active ? "font-bold text-neutral-900" : "font-medium text-neutral-600"
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
