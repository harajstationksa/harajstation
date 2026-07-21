import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/constants";
import { SITE } from "@/lib/seo";
import { Avatar } from "@/components/Avatar";
import { AdminLogout } from "@/components/AdminLogout";
import { AdminNav } from "@/components/AdminNav";
import { AdminSearch } from "@/components/AdminSearch";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaff(STAFF_ROLES);

  return (
    <div className="min-h-screen bg-neutral-100 lg:grid lg:grid-cols-[260px_1fr]">
      {/* ── sidebar (dark, sticky) ── */}
      <aside className="bg-neutral-900 text-white lg:sticky lg:top-0 lg:h-screen flex flex-col">
        <Link href="/admin" className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="حراج ستيشن" className="h-12 w-auto shrink-0 object-contain" />
          <span>
            <span className="block font-display font-extrabold leading-tight">حراج ستيشن</span>
            <span className="block text-[11px] text-neutral-400">لوحة الإدارة</span>
          </span>
        </Link>

        <div className="flex-1 lg:overflow-y-auto p-3">
          <AdminNav role={staff.role} />
        </div>

        <div className="px-4 py-3.5 border-t border-white/10 flex items-center gap-2.5 max-lg:hidden">
          <Avatar name={staff.name} color={staff.avatarColor} src={staff.avatarUrl} className="size-9 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-none truncate">{staff.name}</p>
            <p className="text-[11px] text-primary-400 mt-1">
              {ROLE_LABELS[staff.role] ?? staff.role}
            </p>
          </div>
          <a
            href={SITE}
            target="_blank"
            title="عرض الموقع"
            className="size-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
          >
            <ExternalLink className="size-4" />
          </a>
          <AdminLogout className="size-8 rounded-lg bg-white/10 hover:bg-red-500/30 text-red-300 flex items-center justify-center transition-colors shrink-0 cursor-pointer" />
        </div>
      </aside>

      {/* ── content column ── */}
      <div className="min-w-0 flex flex-col">
        <header className="bg-white border-b border-neutral-200 sticky top-0 z-40">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-14">
            <AdminSearch />
            <div className="ms-auto flex items-center gap-3 shrink-0">
              <a
                href={SITE}
                target="_blank"
                className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="size-4" />
                <span className="max-sm:hidden">عرض الموقع</span>
              </a>
              <span className="lg:hidden flex items-center gap-2">
                <Avatar name={staff.name} color={staff.avatarColor} src={staff.avatarUrl} className="size-8 text-sm" />
                <AdminLogout className="size-8 rounded-lg bg-neutral-100 hover:bg-red-50 text-red-500 flex items-center justify-center transition-colors cursor-pointer" />
              </span>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
