"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BellRing,
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

const items = [
  { href: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/dashboard/listings", label: "إعلاناتي ومزاداتي", icon: ListChecks },
  { href: "/dashboard/campaigns", label: "الحملات الإعلانية", icon: Megaphone },
  { href: "/dashboard/wallet", label: "محفظة النقاط", icon: Wallet },
  { href: "/dashboard/referrals", label: "دعوة الأصدقاء", icon: UserPlus },
  { href: "/dashboard/messages", label: "الرسائل", icon: MessageSquare },
  { href: "/dashboard/verifications", label: "التحققات", icon: ShieldCheck },
  { href: "/dashboard/favorites", label: "المفضلة", icon: Heart },
  { href: "/dashboard/searches", label: "تنبيهات البحث", icon: BellRing },
  { href: "/dashboard/notifications", label: "الإشعارات", icon: Bell },
  { href: "/dashboard/store", label: "متاجري", icon: Store },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="card p-2 flex lg:flex-col gap-1 overflow-x-auto no-scrollbar">
      {items.map(({ href, label, icon: Icon }) => {
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
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
