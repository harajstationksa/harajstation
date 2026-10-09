import { AdminPageHeader } from "@/components/AdminPageHeader";
import { publicAsset, publicUrl } from "@/lib/admin";
import type { Prisma } from "@prisma/client";
import { pageQuery, text, type AdminParams } from "@/lib/admin";
import { AdminPagination } from "@/components/AdminPagination";
import { AdminActionForm } from "@/components/AdminActionForm";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { LISTING_STATUS } from "@/lib/constants";
import { RISK_LABELS, REASON_LABELS, parseReviewReasons, type RiskLevel } from "@/lib/smart-review";
import { formatSAR, parseImages, timeAgo } from "@/lib/utils";
import { removeListingAction, restoreListingAction, toggleFeatureAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "إدارة الإعلانات" };

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  const actor = await requireStaff(["ADMIN", "MODERATOR"], "listings.view");
  const canManage = hasStaffPermission(actor, "listings.manage");
  const sp = await searchParams;
  const q = text(sp.q);
  const status = Object.hasOwn(LISTING_STATUS, text(sp.status)) ? text(sp.status) : "";
  const risk = Object.hasOwn(RISK_LABELS, text(sp.risk)) ? text(sp.risk) : "";
  const reason = Object.hasOwn(REASON_LABELS, text(sp.reason)) ? text(sp.reason) : "";
  const existing = text(sp.view) === "existing";

  const refQuery = q.toUpperCase().startsWith("SM-")
    ? q.toUpperCase()
    : /^\d{4,}$/.test(q)
      ? `SM-${q}`
      : null;

  const where: Prisma.ListingWhereInput = {
    ...(status && !existing ? { status } : {}),
    ...(existing ? { status: "ACTIVE", riskLevel: { not: "NORMAL" }, reviewedAt: null } : {}),
    ...(risk ? { riskLevel: risk } : {}),
    ...(reason ? { riskReasons: { contains: `"${reason}"` } } : {}),
    ...(q
      ? {
          OR: [
            ...(refQuery ? [{ ref: refQuery }] : []),
            { ref: q.toUpperCase() },
            { title: { contains: q } },
            { seller: { name: { contains: q } } },
          ],
        }
      : {}),
  };
  const { page, take, skip } = pageQuery(sp);
  const [total, listings, pendingCount, existingCount] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { seller: true, category: true, auction: true },
      take,
      skip,
    }),
    db.listing.count({ where: { status: "PENDING" } }),
    db.listing.count({
      where: { status: "ACTIVE", riskLevel: { not: "NORMAL" }, reviewedAt: null },
    }),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader section="listings">إدارة الإعلانات</AdminPageHeader>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href="/admin/listings?status=PENDING"
          className="badge bg-amber-50 text-amber-800 hover:bg-amber-100"
        >
          بانتظار المراجعة · {pendingCount}
        </Link>
        <Link
          href="/admin/listings?view=existing"
          className="badge bg-orange-50 text-orange-800 hover:bg-orange-100"
        >
          منشورة تحتاج فحصًا · {existingCount}
        </Link>
      </div>
      {existing && (
        <p className="card p-3 text-xs text-neutral-600">
          هذه مؤشرات لفحص بشري، وليست أحكامًا بمخالفة. الإعلانات لا تختفي من الموقع إلا بقرار مشرف.
        </p>
      )}
      <AdminPagination path="/admin/listings" page={page} total={total} params={sp} />

      {/* filter bar */}
      <form className="admin-filter-form" method="GET">
        {existing && <input type="hidden" name="view" value="existing" />}
        <label>
          البحث
          <input
            name="q"
            defaultValue={q}
            className="input flex-1 min-w-48"
            placeholder="بحث بالرقم المرجعي (SM-100001) أو العنوان أو البائع..."
          />
        </label>
        {!existing && (
          <label>
            الحالة
            <select name="status" className="input w-40" defaultValue={status}>
              <option value="">كل الحالات</option>
              {Object.entries(LISTING_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          مستوى المراجعة
          <select name="risk" className="input w-40" defaultValue={risk}>
            <option value="">كل مستويات المراجعة</option>
            {Object.entries(RISK_LABELS).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          سبب المراجعة
          <select name="reason" className="input w-40" defaultValue={reason}>
            <option value="">كل الأسباب</option>
            {Object.entries(REASON_LABELS).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary">بحث</button>
        {(q || status || risk || reason) && (
          <Link
            href={existing ? "/admin/listings?view=existing" : "/admin/listings"}
            className="btn-secondary"
          >
            مسح
          </Link>
        )}
      </form>

      <div className="admin-table-wrap card overflow-x-auto">
        <table role="table" className="admin-responsive-table w-full text-sm min-w-175">
          <thead role="rowgroup">
            <tr
              role="row"
              className="border-b border-neutral-100 text-right text-xs text-neutral-500"
            >
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                الرقم
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                الإعلان
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                البائع
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                السعر
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                الحالة
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                النشر
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup" className="divide-y divide-neutral-50">
            {listings.map((l) => (
              <tr role="row" key={l.id} className="hover:bg-neutral-50/60">
                <td role="cell" data-label="الرقم" className="p-3">
                  <span className="badge bg-neutral-900 text-white font-mono text-[10px]">
                    {l.ref ?? "—"}
                  </span>
                </td>
                <td role="cell" data-label="الإعلان" data-card-header="true" className="p-3">
                  <Link href={`/admin/listings/${l.id}`} className="flex items-center gap-2 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={publicAsset(parseImages(l.images)[0])}
                      alt=""
                      className="size-10 rounded-lg object-cover border border-neutral-100 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold line-clamp-1 group-hover:text-primary-600 max-w-52">
                        {l.title}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {l.type === "AUCTION" ? "مزاد" : "بيع"} · {l.category.nameAr}
                        {l.isFeatured && " · مميز"}
                      </p>
                      {l.riskLevel !== "NORMAL" && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span
                            className={`badge ${
                              l.riskLevel === "PROHIBITED"
                                ? "bg-red-50 text-red-700"
                                : l.riskLevel === "REGULATED"
                                  ? "bg-orange-50 text-orange-700"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {RISK_LABELS[l.riskLevel as RiskLevel] ?? l.riskLevel}
                          </span>
                          {parseReviewReasons(l.riskReasons)
                            .slice(0, 2)
                            .map((code) => (
                              <span key={code} className="badge bg-neutral-100 text-neutral-600">
                                {REASON_LABELS[code]}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </Link>
                </td>
                <td role="cell" data-label="البائع" className="p-3 text-xs text-neutral-600">
                  {l.seller.name}
                </td>
                <td role="cell" data-label="السعر" className="p-3 tabular-nums text-xs">
                  {l.price != null
                    ? formatSAR(l.price)
                    : l.auction
                      ? formatSAR(l.auction.winningBid ?? l.auction.startPrice)
                      : "—"}
                </td>
                <td role="cell" data-label="الحالة" className="p-3">
                  <span
                    className={`badge ${
                      l.status === "ACTIVE"
                        ? "bg-green-50 text-green-700"
                        : l.status === "REMOVED"
                          ? "bg-red-50 text-red-600"
                          : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {LISTING_STATUS[l.status as keyof typeof LISTING_STATUS] ?? l.status}
                  </span>
                </td>
                <td
                  role="cell"
                  data-label="النشر"
                  className="p-3 text-xs text-neutral-400"
                  suppressHydrationWarning
                >
                  {timeAgo(l.createdAt)}
                </td>
                <td role="cell" data-label="الإجراءات" data-card-actions="true" className="p-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {l.status === "ACTIVE" && (
                      <a
                        href={publicUrl(
                          l.auction ? `/auctions/${l.auction.id}` : `/listings/${l.id}`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="badge bg-neutral-100 text-neutral-600"
                      >
                        عرض
                      </a>
                    )}
                    {["PENDING", "AWAITING_INFO"].includes(l.status) && (
                      <Link
                        href={`/admin/listings/${l.id}`}
                        className="badge bg-amber-100 text-amber-800"
                      >
                        {canManage ? "مراجعة" : "تفاصيل"}
                      </Link>
                    )}
                    {existing && (
                      <Link
                        href={`/admin/listings/${l.id}`}
                        className="badge bg-orange-100 text-orange-800"
                      >
                        فحص
                      </Link>
                    )}
                    {canManage && (
                      <AdminActionForm action={toggleFeatureAction}>
                        <input type="hidden" name="listingId" value={l.id} />
                        <button
                          disabled={l.status !== "ACTIVE"}
                          className="badge bg-primary-500 text-white cursor-pointer hover:bg-primary-600 disabled:opacity-40"
                        >
                          {l.isFeatured ? "إلغاء التمييز" : "تمييز"}
                        </button>
                      </AdminActionForm>
                    )}
                    {canManage &&
                      (l.status === "REMOVED" ? (
                        <AdminActionForm action={restoreListingAction}>
                          <input type="hidden" name="listingId" value={l.id} />
                          <button className="badge bg-green-600 text-white cursor-pointer hover:bg-green-700">
                            استرجاع
                          </button>
                        </AdminActionForm>
                      ) : (
                        <AdminActionForm
                          action={removeListingAction}
                          confirm="حذف الإعلان وإيقاف المزاد والحملات المرتبطة؟"
                        >
                          <input type="hidden" name="listingId" value={l.id} />
                          <button className="badge bg-red-600 text-white cursor-pointer hover:bg-red-700">
                            حذف
                          </button>
                        </AdminActionForm>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
