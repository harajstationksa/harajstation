import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { CredibilityBadge } from "@/components/CredibilityBadge";
import { DashboardNav } from "@/components/DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="container-page py-6 pb-12">
      <div className="card p-4 sm:p-5 flex items-center gap-4 mb-6">
        <Avatar name={user.name} color={user.avatarColor} src={user.avatarUrl} pro={user.isPro} className="size-14 text-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-lg flex items-center gap-2">
            {user.name}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <CredibilityBadge score={user.credibility} />
            <span className="text-xs text-neutral-400">{user.city}</span>
          </div>
        </div>
        <Link href="/sell" className="btn-primary max-sm:hidden">أضف إعلان</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
        <DashboardNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
