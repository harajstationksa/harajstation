import { AdminPageHeader } from "@/components/AdminPageHeader";
import { pageQuery, type AdminParams } from "@/lib/admin";
import { AdminPagination } from "@/components/AdminPagination";
import { publicUrl } from "@/lib/admin";
import Link from "next/link";

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { formatSAR, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "سجل المزايدات" };

export default async function AdminBidsPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  await requireStaff(["ADMIN", "MODERATOR"], "bids.view");
  const sp = await searchParams;
  const { page, take, skip } = pageQuery(sp);
  const total = await db.bid.count();

  const bids = await db.bid.findMany({
    include: {
      bidder: true,
      auction: { include: { listing: { include: { seller: true } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    skip,
  });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        section="bids"
        description={
          <>
            الهويات الحقيقية للمزايدين تظهر هنا فقط ضمن صلاحيات الإدارة — لمراجعة أي نشاط مشبوه أو
            تلاعب بالأسعار
          </>
        }
      >
        سجل المزايدات الكامل
      </AdminPageHeader>
      <AdminPagination path="/admin/bids" page={page} total={total} params={sp} />

      <div className="admin-table-wrap card overflow-x-auto">
        <table role="table" className="admin-responsive-table w-full text-sm min-w-175">
          <thead role="rowgroup">
            <tr
              role="row"
              className="border-b border-neutral-100 text-right text-xs text-neutral-500"
            >
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                المزايد (الحقيقي)
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                الاسم المقنّع
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                المزاد
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                البائع
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                المبلغ
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                التوقيت
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup" className="divide-y divide-neutral-50">
            {bids.map((b) => (
              <tr role="row" key={b.id} className="hover:bg-neutral-50/60">
                <td
                  role="cell"
                  data-label="المزايد الحقيقي"
                  data-card-header="true"
                  className="p-3"
                >
                  <Link
                    href={publicUrl(`/profile/${b.bidderId}`)}
                    className="font-semibold hover:text-primary-600"
                  >
                    {b.bidder.name}
                  </Link>
                  <p className="text-xs text-neutral-400">{b.bidder.email}</p>
                </td>
                <td role="cell" data-label="الاسم المقنّع" className="p-3 text-xs text-neutral-500">
                  {b.maskedName}
                </td>
                <td role="cell" data-label="المزاد" data-card-wide="true" className="p-3">
                  <Link
                    href={publicUrl(`/auctions/${b.auctionId}`)}
                    className="text-xs text-primary-600 hover:underline line-clamp-1 max-w-52"
                  >
                    {b.auction.listing.title}
                  </Link>
                </td>
                <td role="cell" data-label="البائع" className="p-3 text-xs text-neutral-500">
                  {b.auction.listing.seller.name}
                </td>
                <td role="cell" data-label="المبلغ" className="p-3 font-bold tabular-nums text-xs">
                  {formatSAR(b.amount)}
                </td>
                <td
                  role="cell"
                  data-label="التوقيت"
                  className="p-3 text-xs text-neutral-400"
                  suppressHydrationWarning
                >
                  {timeAgo(b.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
