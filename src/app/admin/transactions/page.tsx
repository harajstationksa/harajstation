import { AdminEmptyState } from "@/components/AdminEmptyState";
import { AdminStatusBadge, ADMIN_STATUS_LABELS } from "@/components/AdminStatusBadge";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { text, pageQuery, type AdminParams } from "@/lib/admin";
import { AdminPagination } from "@/components/AdminPagination";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<AdminParams> }) {
  await requireStaff(["ADMIN", "SUPPORT"], "transactions.view");
  const sp = await searchParams,
    { page, take, skip } = pageQuery(sp),
    status = ["PENDING", "CONFIRMED", "CANCELLED", "DISPUTED", "EXPIRED"].includes(text(sp.status))
      ? text(sp.status)
      : "",
    where = status ? { status } : {};
  const [rows, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { buyer: true, seller: true, listing: true, dispute: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
    }),
    db.transaction.count({ where }),
  ]);
  return (
    <div className="space-y-5">
      <AdminPageHeader
        section="transactions"
        description={<>معاملات تأكيد البيع بين الأعضاء؛ لا تمثل مدفوعات بوابة شحن النقاط.</>}
      >
        معاملات البيع
      </AdminPageHeader>
      <form className="admin-filter-form">
        <label>
          الحالة
          <select className="input" name="status" defaultValue={status}>
            <option value="">كل الحالات</option>
            {["PENDING", "CONFIRMED", "CANCELLED", "DISPUTED", "EXPIRED"].map((s) => (
              <option key={s} value={s}>
                {ADMIN_STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary">عرض</button>
      </form>
      <AdminPagination path="/admin/transactions" page={page} total={total} params={sp} />
      {rows.length === 0 && <AdminEmptyState title="لا توجد معاملات مطابقة" />}
      {rows.map((t) => (
        <article className="card p-4 space-y-2" key={t.id}>
          <b>
            {t.listing.title} <AdminStatusBadge status={t.status} />
          </b>
          <p>
            البائع: {t.seller.name} — المشتري: {t.buyer.name} — المبلغ: {t.amount} ر.س
          </p>
          <p>
            رد البائع: {t.sellerAnswer ?? "لم يرد"} — رد المشتري: {t.buyerAnswer ?? "لم يرد"}
          </p>
          <p>الموعد النهائي: {t.deadline.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</p>
          {t.dispute && (
            <Link href="/admin/disputes" className="text-primary-600">
              مراجعة النزاع
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}
