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
      {/* liquid-glass floating bar */}
      <div className="pointer-events-auto mx-auto max-w-sm rounded-[1.75rem] border border-white/60 bg-white/70 backdrop-blur-2xl backdrop-saturate-150 shadow-xl shadow-black/15 ring-1 ring-black/5">
        <div className="flex items-center justify-around h-16 px-2">
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
                  <span className="size-12 rounded-full bg-gradient-to-b from-primary-400 to-primary-600 text-white shadow-lg shadow-primary-500/30 ring-1 ring-white/40 flex items-center justify-center active:scale-95 transition-transform">
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
                      ? "bg-white shadow-sm shadow-black/10 ring-1 ring-black/5 text-primary-600"
                      : "text-neutral-500"
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span
                  className={cn(
                    "text-[10px] leading-none transition-colors",
                    active ? "font-bold text-neutral-900" : "font-medium text-neutral-400"
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
