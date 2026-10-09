import type { ReactNode } from "react";
import {
  Activity,
  BadgePercent,
  Coins,
  FileSearch,
  Flag,
  Gavel,
  Image,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
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
import { ADMIN_SECTIONS } from "@/lib/admin-sections";

const icons = {
  dashboard: LayoutDashboard,
  users: Users,
  listings: ListChecks,
  listing: ListChecks,
  bids: Gavel,
  campaigns: Megaphone,
  promos: BadgePercent,
  banners: Image,
  disputes: Scale,
  identity: UserCheck,
  stores: Store,
  reports: Flag,
  moderation: ShieldBan,
  finance: Wallet,
  transactions: Wallet,
  audit: ShieldCheck,
  plans: Wallet,
  points: Coins,
  staff: Users,
  operations: Activity,
  account: UserCog,
  search: FileSearch,
  forbidden: LockKeyhole,
};

export function AdminPageHeader({
  section,
  children,
  description,
  actions,
}: {
  section: string;
  children?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const info = ADMIN_SECTIONS[section];
  const Icon = icons[section as keyof typeof icons] ?? LayoutDashboard;
  return (
    <div className="admin-page-header">
      <div className="admin-page-heading">
        <span className="admin-page-icon" aria-hidden="true">
          <Icon size={23} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <h1>{children ?? info?.title}</h1>
          <p>{description ?? info?.description}</p>
        </div>
      </div>
      {actions && <div className="admin-page-actions">{actions}</div>}
    </div>
  );
}

export function AdminStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="card admin-stat-card">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {hint && <p className="text-xs text-neutral-500 mt-2">{hint}</p>}
    </div>
  );
}
