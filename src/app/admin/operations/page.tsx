import { AdminPageHeader, AdminStatCard } from "@/components/AdminPageHeader";
import { readFile } from "node:fs/promises";
import { requireStaff } from "@/lib/auth";
import { operationsHealth, monitorFresh } from "@/lib/operations-health";
import { AutoRefresh } from "@/components/AutoRefresh";
export const dynamic = "force-dynamic";
const labels: Record<string, string> = {
  application_jobs_or_redis: "فحص التشغيل قديم: راجع التفاصيل المباشرة أدناه",
  application_unreachable: "خدمة الموقع لا تستجيب",
  recent_server_errors: "أخطاء طلبات خلال آخر 15 دقيقة",
  stale_jobs: "مهمة مجدولة متأخرة أو فاشلة",
  failed_background_jobs: "مهام إرسال متوقفة",
  queue_delayed: "تأخر طابور الإشعارات",
  redis_unavailable: "Redis غير متاح",
  health_unauthorized: "مفتاح المراقبة غير صالح",
  backup_older_than_26_hours: "النسخة الاحتياطية متأخرة لأكثر من 26 ساعة",
  backup_unavailable: "تعذر فحص النسخ الاحتياطي",
  offsite_backup_unverified: "لم يُؤكد وصول نسخة مشفّرة خارج السيرفر",
  offsite_backup_failed: "فشل نقل النسخة الاحتياطية خارج السيرفر",
  offsite_backup_older_than_26_hours: "النسخة الخارجية متأخرة لأكثر من 26 ساعة",
  smtp_connection_failed: "تعذر الاتصال بالبريد",
  nginx_inactive: "خادم الويب متوقف",
  cron_inactive: "الجدولة متوقفة",
  "redis-server_inactive": "Redis متوقف",
};
export default async function Page() {
  await requireStaff(["ADMIN"], "operations.view");
  const health = await operationsHealth();
  let state: {
    checkedAt: string;
    ok: boolean;
    problems: string[];
    backupAgeHours: number | null;
    offsiteAgeHours?: number | null;
  } | null = null;
  try {
    state = JSON.parse(await readFile("/var/lib/harajstation/ops-health.json", "utf8"));
  } catch {}
  const fresh = !!state && monitorFresh(state.checkedAt);
  return (
    <div className="space-y-5">
      <AutoRefresh seconds={30} />
      <AdminPageHeader
        section="operations"
        description={
          <>
            تحديث تلقائي كل 30 ثانية. أخطاء الطلبات لها نافذة متابعة 15 دقيقة؛ زوال التنبيه لا يعني
            إصلاح السبب دون مراجعة.
          </>
        }
      >
        صحة التشغيل
      </AdminPageHeader>
      <div className="grid sm:grid-cols-3 gap-4">
        <AdminStatCard label="الاتصال بذاكرة Redis" value={health.redis ? "متصل" : "غير متاح"} />
        <AdminStatCard label="مهام الإشعارات المتوقفة" value={health.failedJobs} />
        <AdminStatCard
          label="النسخة المحلية"
          value={
            state?.backupAgeHours == null ? "غير متاحة" : `${state.backupAgeHours.toFixed(1)} ساعة`
          }
        />
      </div>
      <div className="card p-5 space-y-2">
        <h2 className="font-bold">
          {health.ok && fresh && state?.ok ? "الخدمات تعمل بصورة طبيعية" : "توجد حالة تحتاج مراجعة"}
        </h2>
        {!fresh && (
          <p className="text-red-700">
            فحص النسخ والبريد والخدمات غير متاح أو متأخر أكثر من 3 دقائق.
          </p>
        )}
        {state?.problems.map((p) => (
          <p key={p} className="text-red-700">
            {labels[p] ?? p}
          </p>
        ))}
        <p>
          آخر فحص خارجي للخدمات:{" "}
          {state?.checkedAt
            ? new Date(state.checkedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })
            : "غير متاح"}
        </p>
        <p>عمر النسخة الخارجية المؤكدة: {state?.offsiteAgeHours?.toFixed(1) ?? "غير معلوم"} ساعة</p>
        <p>عمر النسخة المحلية: {state?.backupAgeHours?.toFixed(1) ?? "غير معلوم"} ساعة</p>
      </div>
      <div className="card p-5 space-y-2">
        <h2 className="font-bold">الفحص المباشر للتطبيق</h2>
        <p>Redis: {health.redis ? "متصل" : "غير متاح / غير مضبوط"}</p>
        <p>
          مهام الإشعارات المتوقفة: {health.failedJobs} — تأخر الطابور:{" "}
          {health.queueDelayed ? "نعم" : "لا"}
        </p>
        <p>مهام الجدولة المتأخرة: {health.staleJobs.join("، ") || "لا توجد"}</p>
        <p className={health.recentErrors ? "text-red-700" : ""}>
          أخطاء طلبات حديثة: {health.recentErrors ? "نعم — راجع السجل الخاص للخادم" : "لا"}
        </p>
        {health.lastError && (
          <p>
            آخر مسار متأثر: <code>{health.lastError.route}</code> — {health.lastError.at}
          </p>
        )}
        <p className="text-xs text-neutral-500">
          لا تعرض اللوحة نص الخطأ أو بيانات الطلبات الحساسة. التشخيص النهائي من سجل الخادم الخاص.
        </p>
      </div>
      <div className="admin-table-wrap card overflow-x-auto">
        <table role="table" className="admin-responsive-table w-full text-sm min-w-160">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">
                المهمة / المسار
              </th>
              <th role="columnheader" scope="col">
                آخر نجاح
              </th>
              <th role="columnheader" scope="col">
                آخر فشل
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {health.checks.map((c) => (
              <tr role="row" className="border-t" key={c.key}>
                <td
                  role="cell"
                  data-label="المهمة / المسار"
                  data-card-header="true"
                  className="p-2"
                >
                  {c.key}
                </td>
                <td role="cell" data-label="آخر نجاح" data-card-wide="true">
                  {c.lastSuccessAt?.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }) ?? "—"}
                </td>
                <td role="cell" data-label="آخر فشل" data-card-wide="true">
                  {c.lastFailureAt?.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
