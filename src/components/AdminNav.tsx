"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  Coins,
  Flag,
  Gavel,
  Image as ImageIcon,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Scale,
  ShieldBan,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const groups: {
  label: string;
  items: { href: string; label: string; icon: typeof Users; roles: string[] }[];
}[] = [
  {
    label: "عام",
    items: [
      { href: "/admin", label: "لوحة المعلومات", icon: LayoutDashboard, roles: ["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"] },
      { href: "/admin/users", label: "إدارة المستخدمين", icon: Users, roles: ["ADMIN", "MODERATOR", "SUPPORT"] },
      { href: "/admin/listings", label: "إدارة الإعلانات", icon: ListChecks, roles: ["ADMIN", "MODERATOR"] },
      { href: "/admin/bids", label: "سجل المزايدات", icon: Gavel, roles: ["ADMIN", "MODERATOR"] },
    ],
  },
  {
    label: "التسويق",
    items: [
      { href: "/admin/campaigns", label: "الحملات الإعلانية", icon: Megaphone, roles: ["ADMIN", "MODERATOR"] },
      { href: "/admin/promos", label: "الإحالة وأكواد الخصم", icon: BadgePercent, roles: ["ADMIN"] },
      { href: "/admin/banners", label: "إدارة البانرات", icon: ImageIcon, roles: ["ADMIN"] },
    ],
  },
  {
    label: "الثقة والأمان",
    items: [
      { href: "/admin/disputes", label: "إدارة النزاعات", icon: Scale, roles: ["ADMIN", "SUPPORT"] },
      { href: "/admin/identity", label: "توثيق الهوية", icon: UserCheck, roles: ["ADMIN", "MODERATOR"] },
      { href: "/admin/reports", label: "البلاغات", icon: Flag, roles: ["ADMIN", "MODERATOR", "SUPPORT"] },
      { href: "/admin/moderation", label: "الإشراف والإشعارات", icon: ShieldBan, roles: ["ADMIN"] },
    ],
  },
  {
    label: "المالية",
    items: [
      { href: "/admin/plans", label: "الباقات والأسعار", icon: Wallet, roles: ["ADMIN"] },
      { href: "/admin/points", label: "النقاط والأسعار", icon: Coins, roles: ["ADMIN"] },
      { href: "/admin/staff", label: "إدارة الموظفين", icon: ShieldCheck, roles: ["ADMIN"] },
    ],
  },
];

export function AdminNav({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex lg:flex-col gap-1 lg:gap-0.5 overflow-x-auto no-scrollbar">
      {groups.map((group) => {
        const visible = group.items.filter((item) => item.roles.includes(role));
        if (visible.length === 0) return null;
        return (
          <div key={group.label} className="flex lg:flex-col gap-1 lg:gap-0.5 shrink-0 lg:shrink">
            <p className="max-lg:hidden text-[10px] font-bold text-neutral-500 tracking-wider px-3 pt-4 pb-1.5 first:pt-1">
              {group.label}
            </p>
            {visible.map(({ href, label, icon: Icon }) => {
              const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-primary-500 text-white shadow-sm shadow-primary-500/30"
                      : "text-neutral-300 hover:bg-white/8 hover:text-white"
                  )}
                >
                  <Icon className="size-4.5 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
