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
  Store,
  UserCheck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { hasStaffPermission, STAFF_NAV_ACCESS } from "@/lib/staff-permissions";

const groups: {
  label: string;
  items: { href: string; label: string; icon: typeof Users; roles: string[] }[];
}[] = [
  {
    label: "نظرة عامة",
    items: [
      {
        href: "/admin",
        label: "لوحة المعلومات",
        icon: LayoutDashboard,
        roles: ["ADMIN", "MODERATOR", "SUPPORT"],
      },
      {
        href: "/admin/search",
        label: "بحث الإدارة",
        icon: ListChecks,
        roles: ["ADMIN", "MODERATOR", "SUPPORT"],
      },
      {
        href: "/admin/users",
        label: "إدارة المستخدمين",
        icon: Users,
        roles: ["ADMIN", "MODERATOR", "SUPPORT"],
      },
      {
        href: "/admin/listings",
        label: "إدارة الإعلانات",
        icon: ListChecks,
        roles: ["ADMIN", "MODERATOR"],
      },
      {
        href: "/admin/bids",
        label: "سجل المزايدات",
        icon: Gavel,
        roles: ["ADMIN", "MODERATOR"],
      },
    ],
  },
  {
    label: "الثقة والأمان",
    items: [
      {
        href: "/admin/reports",
        label: "البلاغات",
        icon: Flag,
        roles: ["ADMIN", "MODERATOR", "SUPPORT"],
      },
      {
        href: "/admin/disputes",
        label: "إدارة النزاعات",
        icon: Scale,
        roles: ["ADMIN", "SUPPORT"],
      },
      {
        href: "/admin/identity",
        label: "توثيق الهوية",
        icon: UserCheck,
        roles: ["ADMIN", "MODERATOR"],
      },
      {
        href: "/admin/stores",
        label: "توثيق المتاجر",
        icon: Store,
        roles: ["ADMIN", "MODERATOR"],
      },
      {
        href: "/admin/moderation",
        label: "الإشراف والإشعارات",
        icon: ShieldBan,
        roles: ["ADMIN"],
      },
    ],
  },
  {
    label: "التسويق",
    items: [
      {
        href: "/admin/campaigns",
        label: "الحملات الإعلانية",
        icon: Megaphone,
        roles: ["ADMIN", "MODERATOR"],
      },
      {
        href: "/admin/promos",
        label: "الإحالة وأكواد الخصم",
        icon: BadgePercent,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/banners",
        label: "إدارة البانرات",
        icon: ImageIcon,
        roles: ["ADMIN"],
      },
    ],
  },
  {
    label: "المالية",
    items: [
      {
        href: "/admin/finance",
        label: "التقارير المالية",
        icon: Wallet,
        roles: ["ADMIN", "ACCOUNTANT"],
      },
      {
        href: "/admin/transactions",
        label: "معاملات البيع",
        icon: Wallet,
        roles: ["ADMIN", "SUPPORT"],
      },
    ],
  },
  {
    label: "إدارة المنصة",
    items: [
      {
        href: "/admin/plans",
        label: "الباقات والأسعار",
        icon: Wallet,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/points",
        label: "النقاط والأسعار",
        icon: Coins,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/staff",
        label: "إدارة الموظفين",
        icon: ShieldCheck,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/audit",
        label: "سجل الإدارة الكامل",
        icon: ShieldCheck,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/operations",
        label: "صحة التشغيل",
        icon: ShieldCheck,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/account",
        label: "حسابي",
        icon: UserCog,
        roles: ["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"],
      },
    ],
  },
];

export function AdminNav({
  role,
  staffPermissions,
  onNavigate,
}: {
  role: string;
  staffPermissions: string;
  drawer?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="أقسام لوحة الإدارة" className="flex flex-col">
      {groups.map((group) => {
        const visible = group.items.filter((item) => {
          if (item.href === "/admin/account") return true;
          if (item.href === "/admin/staff") return role === "ADMIN";
          if (
            item.href === "/admin/search" &&
            !hasStaffPermission({ role, staffPermissions }, "users.view") &&
            !hasStaffPermission({ role, staffPermissions }, "listings.view")
          )
            return false;
          const permission = STAFF_NAV_ACCESS[item.href];
          return (
            !!permission &&
            (item.roles.includes(role) || role === "STAFF") &&
            hasStaffPermission({ role, staffPermissions }, permission)
          );
        });
        if (visible.length === 0) return null;
        return (
          <div key={group.label} className="admin-nav-group">
            <p className="admin-nav-label">{group.label}</p>
            {visible.map(({ href, label, icon: Icon }) => {
              const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className="admin-nav-link"
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
