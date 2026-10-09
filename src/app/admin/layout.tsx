import "./admin.css";
import { publicAsset } from "@/lib/admin";
import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/constants";
import { SITE } from "@/lib/seo";
import { Avatar } from "@/components/Avatar";
import { AdminLogout } from "@/components/AdminLogout";
import { AdminNav } from "@/components/AdminNav";
import { AdminSearch } from "@/components/AdminSearch";
import { AdminMobileMenu } from "@/components/AdminMobileMenu";
import { AdminBreadcrumb } from "@/components/AdminBreadcrumb";
import { hasStaffPermission, staffHomePath } from "@/lib/staff-permissions";

export const metadata = {
  manifest: null,
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.ico" },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff(STAFF_ROLES);
  const avatar = staff.avatarUrl ? publicAsset(staff.avatarUrl) : undefined;
  const canSearch =
    hasStaffPermission(staff, "search.view") &&
    (hasStaffPermission(staff, "users.view") || hasStaffPermission(staff, "listings.view"));
  return (
    <div className="admin-shell lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[110] btn-primary"
      >
        الانتقال إلى محتوى الصفحة
      </a>
      <aside className="admin-sidebar max-lg:hidden sticky top-0 h-dvh flex flex-col">
        <Link href={staffHomePath(staff)} className="admin-brand">
          <span className="admin-brand-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" />
          </span>
          <span>
            <span className="block font-display text-base font-extrabold">حراج ستيشن</span>
            <span className="block text-[11px] text-neutral-400 mt-0.5">إدارة المنصة</span>
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <AdminNav role={staff.role} staffPermissions={staff.staffPermissions} />
        </div>
        <div className="admin-sidebar-profile">
          <Link href="/admin/account" className="flex items-center gap-2.5 min-w-0">
            <Avatar
              name={staff.name}
              color={staff.avatarColor}
              src={avatar}
              className="size-10 text-sm"
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold truncate">{staff.name}</span>
              <span className="block text-[11px] text-neutral-500 truncate">
                {ROLE_LABELS[staff.role] ?? staff.role}
              </span>
            </span>
          </Link>
          <div className="flex items-center justify-between border-t border-neutral-100 pt-3 mt-3">
            <span className="flex gap-1.5 items-center text-[10px] text-neutral-500">
              <ShieldCheck size={13} className="text-emerald-600" /> جلسة محمية
            </span>
            <AdminLogout className="size-8 rounded-lg bg-neutral-100 hover:bg-red-50 text-neutral-500 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer" />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex flex-col">
        <header className="admin-topbar sticky top-0 z-40">
          <div className="admin-topbar-content flex items-center gap-3 px-4 sm:px-6 xl:px-8 min-h-20">
            <AdminMobileMenu role={staff.role} staffPermissions={staff.staffPermissions} />
            <Link href={staffHomePath(staff)} className="admin-header-brand lg:hidden min-w-0">
              <span className="block font-display text-sm font-extrabold">لوحة الإدارة</span>
              <span className="block text-xs text-neutral-500 truncate">
                {ROLE_LABELS[staff.role] ?? staff.role}
              </span>
            </Link>
            <AdminBreadcrumb />
            {canSearch && <AdminSearch />}
            {!canSearch && (
              <span className="max-lg:hidden xl:hidden font-bold text-sm">
                حراج ستيشن · الإدارة
              </span>
            )}
            <div className="admin-header-tools ms-auto flex items-center gap-3 shrink-0">
              <a
                href={SITE}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="عرض الموقع في نافذة جديدة"
                className="flex items-center gap-2 text-xs text-neutral-500 hover:text-primary-700 rounded-xl border border-neutral-200 p-2.5 sm:px-3"
              >
                <ExternalLink size={16} />
                <span className="max-sm:hidden">عرض الموقع</span>
              </a>
              <Link
                href="/admin/account"
                aria-label="حسابي"
                className="admin-header-account flex items-center gap-2.5"
              >
                <Avatar
                  name={staff.name}
                  color={staff.avatarColor}
                  src={avatar}
                  className="size-9 text-xs"
                />
                <span className="hidden 2xl:block max-w-36">
                  <span className="block text-xs font-bold truncate">{staff.name}</span>
                  <span className="block text-[10px] text-neutral-400">
                    {ROLE_LABELS[staff.role]}
                  </span>
                </span>
              </Link>
            </div>
          </div>
        </header>
        <main id="admin-content" tabIndex={-1} className="admin-main flex-1 min-w-0">
          {children}
        </main>
        <footer className="admin-footer px-6 pb-5 text-[10px] text-neutral-400 flex flex-wrap gap-2 justify-between">
          <span>حراج ستيشن · لوحة الإدارة</span>
          <span>تظهر الأقسام والإجراءات بحسب صلاحيات حسابك</span>
        </footer>
      </div>
    </div>
  );
}
