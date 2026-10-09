import { AdminStatusBadge, ADMIN_STATUS_LABELS } from "@/components/AdminStatusBadge";
import { AdminPageHeader, AdminStatCard } from "@/components/AdminPageHeader";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { pageQuery, type AdminParams } from "@/lib/admin";
import { financeFilter } from "@/lib/admin-finance";
import { AdminPagination } from "@/components/AdminPagination";
import { formatDate } from "@/lib/utils";
export const dynamic = "force-dynamic";
export const metadata = { title: "التقارير المالية" };
export default async function Page({ searchParams }: { searchParams: Promise<AdminParams> }) {
  const actor = await requireStaff(["ADMIN", "ACCOUNTANT"], "finance.view");
  const sp = await searchParams,
    { page, take, skip } = pageQuery(sp),
    filter = financeFilter(sp);
  const [payments, ledger, pc, lc, paid] = await Promise.all([
    db.payment.findMany({
      where: filter.payments,
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
    }),
    db.pointTransaction.findMany({
      where: filter.common,
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
    }),
    db.payment.count({ where: filter.payments }),
    db.pointTransaction.count({ where: filter.common }),
    db.payment.aggregate({
      where: { ...filter.payments, status: "PAID" },
      _sum: { amount: true },
      _count: true,
    }),
  ]);
  const query = new URLSearchParams();
  for (const key of ["q", "status", "from", "to"])
    if (typeof sp[key] === "string") query.set(key, sp[key]);
  return (
    <div className="space-y-5">
      <AdminPageHeader
        section="finance"
        description={
          <>
            مدفوعات شحن النقاط ودفتر الحركة للقراءة فقط. قيم المدفوعات بالريال شاملة الضريبة؛ النقاط
            وحدات وليست إيرادًا. فلترة الحالة تخص المدفوعات فقط. التاريخ بتوقيت UTC.
          </>
        }
      >
        التقارير المالية
      </AdminPageHeader>
      <form className="admin-filter-form">
        <label>
          البحث
          <input
            className="input"
            name="q"
            defaultValue={filter.q}
            placeholder="اسم أو بريد المستخدم"
          />
        </label>
        <label>
          الحالة
          <select className="input" name="status" defaultValue={filter.status}>
            <option value="">كل حالات الدفع</option>
            {["PENDING", "PAID", "FAILED", "REFUNDED"].map((s) => (
              <option key={s} value={s}>
                {ADMIN_STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </label>
        <label>
          من{" "}
          <input
            type="date"
            className="input"
            name="from"
            defaultValue={typeof sp.from === "string" ? sp.from : ""}
          />
        </label>
        <label>
          إلى{" "}
          <input
            type="date"
            className="input"
            name="to"
            defaultValue={typeof sp.to === "string" ? sp.to : ""}
          />
        </label>
        <button className="btn-primary">تطبيق</button>
      </form>
      <div className="admin-finance-stats grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <AdminStatCard
          label="إجمالي المدفوعات الناجحة"
          value={`${((paid._sum.amount ?? 0) / 100).toFixed(2)} ر.س`}
          hint="شاملة الضريبة · للفترة والمستخدم"
        />
        <AdminStatCard label="عمليات الدفع الناجحة" value={paid._count} />
        <AdminStatCard label="حركات دفتر النقاط" value={lc} hint="وحدات نقاط وليست إيرادًا" />
      </div>
      {hasStaffPermission(actor, "finance.export") && (
        <div className="flex gap-3 flex-wrap">
          {["payments", "ledger"].map((kind) => (
            <a
              className="btn-secondary"
              key={kind}
              href={`/api/admin/finance/export?${query}&kind=${kind}`}
            >
              تصدير {kind === "payments" ? "المدفوعات" : "دفتر النقاط"} CSV
            </a>
          ))}
        </div>
      )}
      <AdminPagination path="/admin/finance" page={page} total={Math.max(pc, lc)} params={sp} />
      <h2 className="font-bold">المدفوعات ({pc})</h2>
      <div className="admin-table-wrap card overflow-x-auto">
        <table role="table" className="admin-responsive-table w-full text-sm min-w-160">
          <thead role="rowgroup">
            <tr role="row">
              {[
                "المستخدم",
                "المرجع / الفاتورة",
                "الحالة",
                "المبلغ ر.س",
                "النقاط",
                "تاريخ الإنشاء",
              ].map((h) => (
                <th role="columnheader" scope="col" className="p-3 text-right" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {payments.length === 0 && (
              <tr role="row">
                <td role="cell" colSpan={6}>
                  لا توجد مدفوعات مطابقة للفلاتر الحالية
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr role="row" className="border-t" key={p.id}>
                <td role="cell" data-label="المستخدم" data-card-header="true" className="p-3">
                  {p.user.name}
                  <p dir="ltr">{p.user.email}</p>
                </td>
                <td role="cell" data-label="المرجع / الفاتورة" data-card-wide="true">
                  {p.id}
                  <p>{p.invoiceId ?? "—"}</p>
                </td>
                <td role="cell" data-label="الحالة">
                  <AdminStatusBadge status={p.status} />
                </td>
                <td role="cell" data-label="المبلغ ر.س">
                  {(p.amount / 100).toFixed(2)}
                </td>
                <td role="cell" data-label="النقاط">
                  {p.points}
                </td>
                <td role="cell" data-label="تاريخ الإنشاء">
                  {formatDate(p.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!payments.length && <p className="p-4">لا توجد مدفوعات بهذه الصفحة</p>}
      </div>
      <h2 className="font-bold">دفتر النقاط ({lc})</h2>
      <div className="admin-table-wrap card overflow-x-auto">
        <table role="table" className="admin-responsive-table w-full text-sm min-w-160">
          <thead role="rowgroup">
            <tr role="row">
              {["المستخدم", "التغيير بالنقاط", "السبب", "التاريخ"].map((h) => (
                <th role="columnheader" scope="col" className="p-3 text-right" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {ledger.length === 0 && (
              <tr role="row">
                <td role="cell" colSpan={4}>
                  لا توجد حركات نقاط مطابقة للفلاتر الحالية
                </td>
              </tr>
            )}
            {ledger.map((p) => (
              <tr role="row" className="border-t" key={p.id}>
                <td role="cell" data-label="المستخدم" data-card-header="true" className="p-3">
                  {p.user.name}
                  <p dir="ltr">{p.user.email}</p>
                </td>
                <td role="cell" data-label="التغيير بالنقاط">
                  {p.delta}
                </td>
                <td role="cell" data-label="السبب" data-card-wide="true">
                  {p.reason}
                </td>
                <td role="cell" data-label="التاريخ">
                  {formatDate(p.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!ledger.length && <p className="p-4">لا توجد حركة بهذه الصفحة</p>}
      </div>
    </div>
  );
}
