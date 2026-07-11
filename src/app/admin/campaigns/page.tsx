import Link from "next/link";
import { Megaphone } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export const metadata = { title: "الحملات الإعلانية" };

const STATUS: Record<string, [string, string]> = {
  ACTIVE: ["نشطة", "bg-green-50 text-green-700"],
  COMPLETED: ["مكتملة", "bg-blue-50 text-blue-700"],
  CANCELLED: ["ملغاة", "bg-neutral-100 text-neutral-500"],
};

export default async function AdminCampaignsPage() {
  await requireStaff(["ADMIN", "MODERATOR"]);

  const [campaigns, totals] = await Promise.all([
    db.campaign.findMany({
      include: { listing: true, owner: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.campaign.aggregate({ _sum: { pointsSpent: true, delivered: true } }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Megaphone className="size-6 text-primary-500" />
          الحملات الإعلانية
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          إجمالي النقاط المصروفة: {(totals._sum.pointsSpent ?? 0).toLocaleString("en-US")} ·
          إجمالي الزوار المُوصَّلين: {(totals._sum.delivered ?? 0).toLocaleString("en-US")}
        </p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState title="لا توجد حملات بعد" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-175">
            <thead>
              <tr className="border-b border-neutral-100 text-right text-xs text-neutral-500">
                <th className="p-3 font-semibold">الإعلان</th>
                <th className="p-3 font-semibold">المعلن</th>
                <th className="p-3 font-semibold">المدة / الزوار</th>
                <th className="p-3 font-semibold">ظهور / نقرات</th>
                <th className="p-3 font-semibold">النقاط</th>
                <th className="p-3 font-semibold">الحالة</th>
                <th className="p-3 font-semibold">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {campaigns.map((c) => {
                const [label, cls] = STATUS[c.status] ?? [c.status, "bg-neutral-100"];
                return (
                  <tr key={c.id} className="hover:bg-neutral-50/60">
                    <td className="p-3">
                      <Link href={`/listings/${c.listingId}`} className="font-medium hover:text-primary-600 line-clamp-1 max-w-52">
                        {c.listing.title}
                      </Link>
                    </td>
                    <td className="p-3 text-xs text-neutral-600">{c.owner.name}</td>
                    <td className="p-3 tabular-nums text-xs">
                      {c.days > 0 ? `${c.days} ${c.days === 1 ? "يوم" : "أيام"} · ${c.delivered} زائر` : `${c.delivered} / ${c.targetVisitors}`}
                      <span className="text-neutral-400"> · {c.notified} إشعار</span>
                    </td>
                    <td className="p-3 tabular-nums text-xs">
                      {c.impressions.toLocaleString("en-US")} / {c.clicks.toLocaleString("en-US")}
                    </td>
                    <td className="p-3 tabular-nums text-xs">{c.pointsSpent}</td>
                    <td className="p-3"><span className={`badge ${cls}`}>{label}</span></td>
                    <td className="p-3 text-xs text-neutral-400" suppressHydrationWarning>{timeAgo(c.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
