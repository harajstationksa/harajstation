import { AdminPageHeader } from "@/components/AdminPageHeader";
import { pageQuery, type AdminParams } from "@/lib/admin";
import { AdminPagination } from "@/components/AdminPagination";
import { publicUrl } from "@/lib/admin";
import Link from "next/link";

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { AdminEmptyState as EmptyState } from "@/components/AdminEmptyState";

export const dynamic = "force-dynamic";

export const metadata = { title: "الحملات الإعلانية" };

const STATUS: Record<string, [string, string]> = {
  ACTIVE: ["نشطة", "bg-green-50 text-green-700"],
  COMPLETED: ["مكتملة", "bg-blue-50 text-blue-700"],
  CANCELLED: ["ملغاة", "bg-neutral-100 text-neutral-500"],
};

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  await requireStaff(["ADMIN", "MODERATOR"], "campaigns.view");
  const sp = await searchParams;
  const { page, take, skip } = pageQuery(sp);
  const total = await db.campaign.count();

  const [campaigns, totals] = await Promise.all([
    db.campaign.findMany({
      include: { listing: true, owner: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
    }),
    db.campaign.aggregate({ _sum: { pointsSpent: true, delivered: true } }),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        section="campaigns"
        description={
          <>
            إجمالي النقاط المصروفة: {(totals._sum.pointsSpent ?? 0).toLocaleString("en-US")} ·
            إجمالي الزوار المُوصَّلين: {(totals._sum.delivered ?? 0).toLocaleString("en-US")}
          </>
        }
      >
        الحملات الإعلانية
      </AdminPageHeader>
      <AdminPagination path="/admin/campaigns" page={page} total={total} params={sp} />

      {campaigns.length === 0 ? (
        <EmptyState title="لا توجد حملات بعد" />
      ) : (
        <div className="admin-table-wrap card overflow-x-auto">
          <table role="table" className="admin-responsive-table w-full text-sm min-w-175">
            <thead role="rowgroup">
              <tr
                role="row"
                className="border-b border-neutral-100 text-right text-xs text-neutral-500"
              >
                <th role="columnheader" scope="col" className="p-3 font-semibold">
                  الإعلان
                </th>
                <th role="columnheader" scope="col" className="p-3 font-semibold">
                  المعلن
                </th>
                <th role="columnheader" scope="col" className="p-3 font-semibold">
                  المدة / الزوار
                </th>
                <th role="columnheader" scope="col" className="p-3 font-semibold">
                  ظهور / نقرات
                </th>
                <th role="columnheader" scope="col" className="p-3 font-semibold">
                  النقاط
                </th>
                <th role="columnheader" scope="col" className="p-3 font-semibold">
                  الحالة
                </th>
                <th role="columnheader" scope="col" className="p-3 font-semibold">
                  التاريخ
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="divide-y divide-neutral-50">
              {campaigns.map((c) => {
                const [label, cls] = STATUS[c.status] ?? [c.status, "bg-neutral-100"];
                return (
                  <tr role="row" key={c.id} className="hover:bg-neutral-50/60">
                    <td role="cell" data-label="الإعلان" data-card-header="true" className="p-3">
                      <Link
                        href={publicUrl(`/listings/${c.listingId}`)}
                        className="font-medium hover:text-primary-600 line-clamp-1 max-w-52"
                      >
                        {c.listing.title}
                      </Link>
                    </td>
                    <td role="cell" data-label="المعلن" className="p-3 text-xs text-neutral-600">
                      {c.owner.name}
                    </td>
                    <td
                      role="cell"
                      data-label="المدة / الزوار"
                      data-card-wide="true"
                      className="p-3 tabular-nums text-xs"
                    >
                      {c.days > 0
                        ? `${c.days} ${c.days === 1 ? "يوم" : "أيام"} · ${c.delivered} زائر`
                        : `${c.delivered} / ${c.targetVisitors}`}
                      <span className="text-neutral-400"> · {c.notified} إشعار</span>
                    </td>
                    <td role="cell" data-label="ظهور / نقرات" className="p-3 tabular-nums text-xs">
                      {c.impressions.toLocaleString("en-US")} / {c.clicks.toLocaleString("en-US")}
                    </td>
                    <td role="cell" data-label="النقاط" className="p-3 tabular-nums text-xs">
                      {c.pointsSpent}
                    </td>
                    <td role="cell" data-label="الحالة" className="p-3">
                      <span className={`badge ${cls}`}>{label}</span>
                    </td>
                    <td
                      role="cell"
                      data-label="التاريخ"
                      className="p-3 text-xs text-neutral-400"
                      suppressHydrationWarning
                    >
                      {timeAgo(c.createdAt)}
                    </td>
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
