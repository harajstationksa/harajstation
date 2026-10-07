import { AdminPageHeader } from "@/components/AdminPageHeader";
import { pageQuery, text, type AdminParams } from "@/lib/admin";
import { AdminPagination } from "@/components/AdminPagination";
import { publicUrl } from "@/lib/admin";
import { AdminActionForm } from "@/components/AdminActionForm";
import Link from "next/link";

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { decryptText } from "@/lib/crypto";
import { timeAgo } from "@/lib/utils";
import { AdminEmptyState as EmptyState } from "@/components/AdminEmptyState";
import { closeReportAction, hideCommentAction, removeListingAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "البلاغات" };

const TYPE_LABEL: Record<string, string> = {
  LISTING: "إعلان",
  USER: "مستخدم",
  COMMENT: "تعليق",
  MESSAGE: "رسالة",
};

async function targetContext(type: string, id: string) {
  switch (type) {
    case "LISTING": {
      const l = await db.listing.findUnique({
        where: { id },
        include: { seller: true },
      });
      return l
        ? {
            text: `${l.title} — البائع: ${l.seller.name}`,
            href: `/admin/listings/${l.id}`,
          }
        : null;
    }
    case "USER": {
      const u = await db.user.findUnique({ where: { id } });
      return u
        ? {
            text: `${u.name} (${u.email})`,
            href: publicUrl(`/profile/${u.id}`),
          }
        : null;
    }
    case "COMMENT": {
      const c = await db.comment.findUnique({
        where: { id },
        include: { user: true, listing: true },
      });
      return c
        ? {
            text: `«${c.body.slice(0, 80)}» — ${c.user.name} على "${c.listing.title}"`,
            href: `/admin/listings/${c.listingId}`,
            hidden: c.isHidden,
          }
        : null;
    }
    case "MESSAGE": {
      const m = await db.message.findUnique({
        where: { id },
        include: { sender: true },
      });
      // decrypted for moderation: only reported messages surface to admins
      return m
        ? {
            text: `«${decryptText(m.body).slice(0, 80)}» — من ${m.sender.name}`,
          }
        : null;
    }
    default:
      return null;
  }
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  const staff = await requireStaff(["ADMIN", "MODERATOR", "SUPPORT"], "reports.view");
  const canManage = hasStaffPermission(staff, "reports.manage");
  const canRemoveListing = hasStaffPermission(staff, "listings.manage");
  const sp = await searchParams;
  const { page, take, skip } = pageQuery(sp);
  const status = ["OPEN", "APPROVED", "REJECTED", "OPEN", "RESOLVED", "DISMISSED"].includes(
    text(sp.status),
  )
    ? text(sp.status)
    : text(sp.status) == "ALL"
      ? ""
      : "OPEN";
  const where = status ? { status } : {};
  const pendingCount = await db.report.count({ where: { status: "OPEN" } });
  const total = await db.report.count({ where });

  const reports = await db.report.findMany({
    include: { reporter: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    where,
    take,
    skip,
  });

  const withContext = await Promise.all(
    reports.map(async (r) => ({
      ...r,
      ctx: await targetContext(r.targetType, r.targetId),
    })),
  );

  const open = withContext.filter((r) => r.status === "OPEN");
  const closed = withContext.filter((r) => r.status !== "OPEN");

  return (
    <div className="space-y-6">
      <AdminPageHeader section="reports" description={<>{pendingCount} بلاغ مفتوح</>}>
        البلاغات
      </AdminPageHeader>
      <AdminPagination path="/admin/reports" page={page} total={total} params={sp} />
      <form method="GET" className="admin-filter-form">
        <label>
          الحالة
          <select name="status" className="input" defaultValue={status || "ALL"}>
            <option value="OPEN">بانتظار المراجعة</option>
            <option value="ALL">السجل الكامل</option>
          </select>
        </label>
        <button className="btn-secondary">عرض</button>
      </form>

      {open.length === 0 ? (
        <EmptyState title="لا توجد بلاغات مفتوحة" />
      ) : (
        <div className="grid gap-3">
          {open.map((r) => (
            <div key={r.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm">
                    <span className="badge bg-red-50 text-red-600 ml-2">
                      {TYPE_LABEL[r.targetType] ?? r.targetType}
                    </span>
                    <span className="font-semibold">{r.reporter.name}</span>
                    <span className="text-neutral-400 text-xs mr-2" suppressHydrationWarning>
                      {timeAgo(r.createdAt)}
                    </span>
                  </p>
                  <p className="text-sm text-neutral-700">{r.reason}</p>
                  {r.ctx && (
                    <p className="text-xs text-neutral-500">
                      المحتوى المبلّغ عنه:{" "}
                      {r.ctx.href ? (
                        <Link href={r.ctx.href} className="text-primary-600 hover:underline">
                          {r.ctx.text}
                        </Link>
                      ) : (
                        r.ctx.text
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {canManage && r.targetType === "COMMENT" && r.ctx && (
                  <AdminActionForm action={hideCommentAction}>
                    <input type="hidden" name="commentId" value={r.targetId} />
                    <button className="badge bg-neutral-800 text-white cursor-pointer hover:bg-neutral-700">
                      {"hidden" in r.ctx && r.ctx.hidden ? "إظهار التعليق" : "إخفاء التعليق"}
                    </button>
                  </AdminActionForm>
                )}
                {r.targetType === "LISTING" && canRemoveListing && (
                  <AdminActionForm
                    action={removeListingAction}
                    confirm="حذف الإعلان وإيقاف المزاد والحملات المرتبطة؟"
                  >
                    <input type="hidden" name="listingId" value={r.targetId} />
                    <button className="badge bg-red-600 text-white cursor-pointer hover:bg-red-700">
                      حذف الإعلان
                    </button>
                  </AdminActionForm>
                )}
                {canManage && (
                  <AdminActionForm action={closeReportAction}>
                    <input type="hidden" name="reportId" value={r.id} />
                    <input type="hidden" name="outcome" value="RESOLVED" />
                    <button className="badge bg-green-600 text-white cursor-pointer hover:bg-green-700">
                      تمت المعالجة
                    </button>
                  </AdminActionForm>
                )}
                {canManage && (
                  <AdminActionForm action={closeReportAction}>
                    <input type="hidden" name="reportId" value={r.id} />
                    <input type="hidden" name="outcome" value="DISMISSED" />
                    <button className="badge bg-neutral-200 text-neutral-700 cursor-pointer hover:bg-neutral-300">
                      رفض البلاغ
                    </button>
                  </AdminActionForm>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">
            بلاغات سابقة
          </div>
          <ul className="divide-y divide-neutral-50">
            {closed.slice(0, 20).map((r) => (
              <li
                key={r.id}
                className="px-4 py-2.5 text-sm flex items-center justify-between gap-3"
              >
                <span className="line-clamp-1 text-neutral-600">
                  [{TYPE_LABEL[r.targetType]}] {r.reason}
                </span>
                <span
                  className={`badge shrink-0 ${r.status === "RESOLVED" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}
                >
                  {r.status === "RESOLVED" ? "تمت المعالجة" : "مرفوض"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
