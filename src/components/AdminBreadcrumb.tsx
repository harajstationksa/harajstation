"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ADMIN_SECTIONS, adminSectionFromPath } from "@/lib/admin-sections";

export function AdminBreadcrumb() {
  const section = adminSectionFromPath(usePathname());
  return (
    <div className="hidden xl:flex items-center gap-2 text-xs text-neutral-500 shrink-0">
      <Link href="/admin/account" className="hover:text-primary-700">
        مساحة الإدارة
      </Link>
      <ChevronLeft size={13} aria-hidden="true" />
      <span className="font-semibold text-neutral-800">
        {ADMIN_SECTIONS[section]?.title ?? "بحث الإدارة"}
      </span>
    </div>
  );
}
