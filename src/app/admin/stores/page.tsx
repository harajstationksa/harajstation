import { AdminPageHeader } from "@/components/AdminPageHeader";
import { publicAsset } from "@/lib/admin";
import { pageQuery, text, type AdminParams } from "@/lib/admin";
import { AdminPagination } from "@/components/AdminPagination";
import { publicUrl } from "@/lib/admin";
import { AdminActionForm } from "@/components/AdminActionForm";
import Link from "next/link";
import { ExternalLink, Store } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { AdminEmptyState as EmptyState } from "@/components/AdminEmptyState";
import { approveStoreAction, rejectStoreAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "توثيق المتاجر" };

export default async function AdminStoresPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  const actor = await requireStaff(["ADMIN", "MODERATOR"], "stores.view");
  const canReview = hasStaffPermission(actor, "stores.review");
  const sp = await searchParams;
  const { page, take, skip } = pageQuery(sp);
  const status = ["PENDING", "APPROVED", "REJECTED", "OPEN", "RESOLVED", "DISMISSED"].includes(
    text(sp.status),
  )
    ? text(sp.status)
    : text(sp.status) == "ALL"
      ? ""
      : "PENDING";
  const where = status ? { status } : {};
  const pendingCount = await db.storeVerification.count({
    where: { status: "PENDING" },
  });
  const total = await db.storeVerification.count({ where });

  const requests = await db.storeVerification.findMany({
    include: { store: { include: { user: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    where,
    take,
    skip,
  });
  const pending = requests.filter((r) => r.status === "PENDING");
  const reviewed = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        section="stores"
        description={
          <>{pendingCount} طلب بانتظار المراجعة — الموافقة تمنح المتجر شارة «متجر موثّق»</>
        }
      >
        توثيق المتاجر
      </AdminPageHeader>
      <AdminPagination path="/admin/stores" page={page} total={total} params={sp} />
      <form method="GET" className="admin-filter-form">
        <label>
          الحالة
          <select name="status" className="input" defaultValue={status || "ALL"}>
            <option value="PENDING">بانتظار المراجعة</option>
            <option value="ALL">السجل الكامل</option>
          </select>
        </label>
        <button className="btn-secondary">عرض</button>
      </form>

      {pending.length === 0 ? (
        <EmptyState title="لا توجد طلبات توثيق متاجر معلّقة" />
      ) : (
        <div className="grid gap-3">
          {pending.map((r) => (
            <div key={r.id} className="card p-4 space-y-3">
              <div className="flex items-center gap-3">
                {r.store.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicAsset(r.store.logoUrl)}
                    alt=""
                    className="size-10 rounded-xl object-cover border border-neutral-100 shrink-0"
                  />
                ) : (
                  <span className="size-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                    <Store className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm flex items-center gap-2">
                    {r.store.name}
                    <Link
                      href={publicUrl(`/store/${r.store.slug}`)}
                      target="_blank"
                      className="text-neutral-400 hover:text-primary-600"
                    >
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </p>
                  <p className="text-xs text-neutral-400 flex items-center gap-1.5">
                    <Avatar
                      name={r.store.user.name}
                      color={r.store.user.avatarColor}
                      src={r.store.user.avatarUrl ? publicAsset(r.store.user.avatarUrl) : undefined}
                      className="size-4 text-[8px]"
                    />
                    {r.store.user.name} · {r.store.user.email} ·{" "}
                    <span suppressHydrationWarning>{timeAgo(r.createdAt)}</span>
                  </p>
                </div>
              </div>

              {/* the document itself — served through the staff-only API */}
              <a
                href={`/api/store/verify/doc/${r.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50 max-w-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/store/verify/doc/${r.id}`}
                  alt="وثيقة المتجر"
                  className="w-full max-h-72 object-contain"
                />
              </a>

              {canReview && (
                <div className="flex items-center gap-2 flex-wrap">
                  <AdminActionForm action={approveStoreAction}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <button className="badge bg-green-600 text-white cursor-pointer hover:bg-green-700">
                      توثيق المتجر ✓
                    </button>
                  </AdminActionForm>
                  <AdminActionForm
                    action={rejectStoreAction}
                    className="flex items-center gap-2 flex-wrap"
                  >
                    <input type="hidden" name="requestId" value={r.id} />
                    <input
                      name="note"
                      placeholder="سبب الرفض (اختياري)"
                      className="input !py-1.5 !text-xs w-48"
                    />
                    <button className="badge bg-red-600 text-white cursor-pointer hover:bg-red-700">
                      رفض
                    </button>
                  </AdminActionForm>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">طلبات سابقة</div>
          <ul className="divide-y divide-neutral-50">
            {reviewed.slice(0, 30).map((r) => (
              <li
                key={r.id}
                className="px-4 py-2.5 text-sm flex items-center justify-between gap-3"
              >
                <span className="line-clamp-1 text-neutral-600">
                  {r.store.name} — {r.store.user.name}
                  {r.note ? ` — ${r.note}` : ""}
                </span>
                <span
                  className={`badge shrink-0 ${
                    r.status === "APPROVED"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {r.status === "APPROVED" ? "موثّق" : "مرفوض"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
