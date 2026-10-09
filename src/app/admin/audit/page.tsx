import { AdminEmptyState } from "@/components/AdminEmptyState";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { text, pageQuery, type AdminParams } from "@/lib/admin";
import { AdminPagination } from "@/components/AdminPagination";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<AdminParams> }) {
  await requireStaff(["ADMIN"], "audit.view");
  const sp = await searchParams,
    { page, take, skip } = pageQuery(sp),
    q = text(sp.q),
    actor = text(sp.actor),
    where = {
      ...(q
        ? {
            OR: [
              { action: { contains: q, mode: "insensitive" as const } },
              { detail: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(actor ? { actorId: actor } : {}),
    };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
    }),
    db.auditLog.count({ where }),
  ]);
  const actors = await db.user.findMany({
      where: {
        id: { in: rows.flatMap((r) => (r.actorId ? [r.actorId] : [])) },
      },
      select: { id: true, name: true },
    }),
    names = new Map(actors.map((a) => [a.id, a.name]));
  return (
    <div className="space-y-5">
      <AdminPageHeader section="audit" description={<>هذا السجل متاح للمدير فقط.</>}>
        سجل الإدارة الكامل
      </AdminPageHeader>
      <form className="admin-filter-form">
        <label>
          البحث
          <input className="input" name="q" defaultValue={q} placeholder="الإجراء أو التفاصيل" />
        </label>
        <label>
          معرّف عضو الفريق
          <input className="input" name="actor" defaultValue={actor} placeholder="معرّف الموظف" />
        </label>
        <button className="btn-primary">بحث</button>
      </form>
      <AdminPagination path="/admin/audit" page={page} total={total} params={sp} />
      {rows.length === 0 && <AdminEmptyState title="لا توجد إجراءات مطابقة" />}
      <div className="space-y-3">
        {rows.map((r) => (
          <article className="card p-4 break-words" key={r.id}>
            <b>
              {r.actorId ? (names.get(r.actorId) ?? `حساب سابق (${r.actorId})`) : "النظام"} —{" "}
              {r.action}
            </b>
            <p className="text-sm">{r.detail}</p>
            <time dateTime={r.createdAt.toISOString()} className="text-xs text-neutral-500">
              {r.createdAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}
            </time>
          </article>
        ))}
      </div>
    </div>
  );
}
