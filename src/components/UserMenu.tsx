"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  Coins,
  Heart,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquare,
  Settings,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { useLang } from "./LangProvider";

export function UserMenu({
  name,
  color,
  avatarUrl,
  isPro,
  isStaff,
  points = 0,
}: {
  name: string;
  color: string;
  avatarUrl?: string | null;
  isPro: boolean;
  isStaff: boolean;
  points?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { t } = useLang();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const items = [
    { href: "/dashboard", label: t.menu.dashboard, icon: LayoutDashboard },
    { href: "/dashboard/listings", label: t.menu.myListings, icon: ListChecks },
    { href: "/dashboard/messages", label: t.menu.messages, icon: MessageSquare },
    { href: "/dashboard/verifications", label: t.menu.verifications, icon: ShieldCheck },
    { href: "/dashboard/favorites", label: t.menu.favorites, icon: Heart },
    { href: "/dashboard/notifications", label: t.menu.notifications, icon: Bell },
    { href: "/dashboard/settings", label: t.menu.settings, icon: Settings },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 p-0.5 pl-1.5 transition-colors cursor-pointer"
        aria-label="قائمة الحساب"
      >
        <Avatar name={name} color={color} src={avatarUrl} pro={isPro} className="size-8 text-sm" />
        <ChevronDown
          className={cn("size-4 text-neutral-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <>
          {/* mobile scrim */}
          <button
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] sm:hidden"
          />

          {/* panel — dropdown on desktop, glass bottom sheet on mobile */}
          <div
            className={cn(
              "z-50 animate-fade-up",
              // mobile: floating glass sheet
              "max-sm:fixed max-sm:inset-x-3 max-sm:bottom-24 max-sm:rounded-3xl max-sm:border max-sm:border-white/60 max-sm:bg-white/85 max-sm:backdrop-blur-2xl max-sm:backdrop-saturate-150 max-sm:shadow-2xl max-sm:shadow-black/20 max-sm:p-3",
              // desktop: anchored dropdown
              "sm:absolute sm:left-0 sm:top-full sm:mt-2 sm:w-64 sm:rounded-2xl sm:border sm:border-neutral-100 sm:bg-white sm:shadow-xl sm:shadow-black/8 sm:p-2"
            )}
          >
            {/* identity header */}
            <div className="flex items-center gap-3 rounded-2xl bg-neutral-50 max-sm:bg-white/60 p-3 mb-1.5">
              <Avatar name={name} color={color} src={avatarUrl} pro={isPro} className="size-11 text-base" />
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{name}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="chip text-[10px] py-0">
                    <Coins className="size-3 text-primary-500" />
                    {points} {t.menu.points}
                  </span>
                </div>
              </div>
            </div>

            <div className="max-sm:grid max-sm:grid-cols-2 max-sm:gap-1">
              {items.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-100/70 max-sm:bg-white/50 transition-colors"
                >
                  <Icon className="size-4.5 text-neutral-400 shrink-0" />
                  {label}
                </Link>
              ))}
            </div>

            <div className="border-t border-neutral-100 max-sm:border-white/60 mt-1.5 pt-1.5 space-y-0.5">
              {isStaff && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100/70 transition-colors"
                >
                  <Wrench className="size-4.5 text-neutral-400" />
                  {t.menu.admin}
                </Link>
              )}
              <button
                onClick={logout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut className="size-4.5" />
                {t.menu.logout}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
