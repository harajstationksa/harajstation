"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BellRing,
  HandCoins,
  Heart,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessageSquare,
  Settings,
  ShieldCheck,
  Store,
  UserPlus,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/components/LangProvider";

const items = [
  { href: "/dashboard", key: "overview", icon: LayoutDashboard },
  { href: "/dashboard/listings", key: "listings", icon: ListChecks },
  { href: "/dashboard/offers", key: "offers", icon: HandCoins },
  { href: "/dashboard/campaigns", key: "campaigns", icon: Megaphone },
  { href: "/dashboard/wallet", key: "wallet", icon: Wallet },
  { href: "/dashboard/referrals", key: "referrals", icon: UserPlus },
  { href: "/dashboard/messages", key: "messages", icon: MessageSquare },
  { href: "/dashboard/verifications", key: "verifications", icon: ShieldCheck },
  { href: "/dashboard/favorites", key: "favorites", icon: Heart },
  { href: "/dashboard/searches", key: "searches", icon: BellRing },
  { href: "/dashboard/notifications", key: "notifications", icon: Bell },
  { href: "/dashboard/store", key: "stores", icon: Store },
  { href: "/dashboard/settings", key: "settings", icon: Settings },
] as const;

export function DashboardNav() {
  const pathname = usePathname();
  const { t } = useLang();

  return (
    <nav className="card p-2 flex lg:flex-col gap-1 overflow-x-auto no-scrollbar">
      {items.map(({ href, key, icon: Icon }) => {
        const active =
          href === "/dashboard" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-primary-50 text-primary-700"
                : "text-neutral-600 hover:bg-neutral-50"
            )}
          >
            <Icon className="size-4.5 shrink-0" />
            {t.dash.nav[key]}
          </Link>
        );
      })}
    </nav>
  );
}
