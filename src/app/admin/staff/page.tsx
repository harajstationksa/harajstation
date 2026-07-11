import { ShieldCheck, UserPlus, UserX } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import {
  createStaffAction,
  removeStaffAction,
  updateStaffRoleAction,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "إدارة الموظفين" };

const ROLE_DESC: Record<string, string> = {
  ADMIN: "صلاحيات كاملة على كل شيء",
  MODERATOR: "المستخدمون والإعلانات والمزايدات والبلاغات",
  SUPPORT: "النزاعات والمصداقية والنقاط والبلاغات",
  ACCOUNTANT: "التقارير المالية فقط",
};

export default async function AdminStaffPage() {
  const me = await requireStaff(["ADMIN"]);

  const [staff, recentActions] = await Promise.all([
    db.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      orderBy: { createdAt: "asc" },
    }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const actorNames = new Map(staff.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <ShieldCheck className="size-6 text-primary-500" />
          إدارة الموظفين
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          كل موظف مقيّد بصلاحيات دوره فقط — لا يمكنه تجاوزها
        </p>
      </div>

      {/* staff table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-160">
          <thead>
            <tr className="border-b border-neutral-100 text-right text-xs text-neutral-500">
              <th className="p-3 font-semibold">الموظف</th>
              <th className="p-3 font-semibold">الدور</th>
              <th className="p-3 font-semibold">الصلاحيات</th>
              <th className="p-3 font-semibold">منذ</th>
              <th className="p-3 font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {staff.map((u) => {
              const isSelf = u.id === me.id;
              return (
                <tr key={u.id} className="hover:bg-neutral-50/60">
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} color={u.avatarColor} src={u.avatarUrl} className="size-9 text-sm" />
                      <div>
                        <p className="font-semibold flex items-center gap-1.5">
                          {u.name}
                          {isSelf && <span className="badge bg-primary-50 text-primary-700 text-[10px]">أنت</span>}
                        </p>
                        <p className="text-xs text-neutral-400" dir="ltr">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    {isSelf ? (
                      <span className="badge bg-neutral-900 text-white">{ROLE_LABELS[u.role]}</span>
                    ) : (
                      <form action={updateStaffRoleAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="role" className="input min-h-8 py-0 text-xs w-28" defaultValue={u.role}>
                          {STAFF_ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                        <button className="act-btn bg-neutral-800 text-white hover:bg-neutral-700">حفظ</button>
                      </form>
                    )}
                  </td>
                  <td className="p-3 text-xs text-neutral-500 max-w-52">{ROLE_DESC[u.role]}</td>
                  <td className="p-3 text-xs text-neutral-400">{formatDate(u.createdAt)}</td>
                  <td className="p-3">
                    {!isSelf && (
                      <form action={removeStaffAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <ConfirmSubmit
                          confirm={`إزالة ${u.name} من فريق العمل؟ سيتحول لمستخدم عادي.`}
                          className="act-btn bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          <UserX className="size-3.5" />
                          إزالة
                        </ConfirmSubmit>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* add staff */}
      <form action={createStaffAction} className="card p-5 space-y-4 border-dashed">
        <h2 className="font-bold flex items-center gap-2">
          <UserPlus className="size-5 text-primary-500" />
          إضافة موظف جديد
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">الاسم</label>
            <input name="name" className="input" required minLength={2} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">البريد الإلكتروني</label>
            <input name="email" className="input" dir="ltr" type="email" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">كلمة المرور</label>
            <input name="password" className="input" dir="ltr" type="password" required minLength={8} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">الدور</label>
            <select name="role" className="input" defaultValue="SUPPORT">
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_DESC[r]}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-neutral-400">
          لو كان البريد لحساب مستخدم موجود، سيُرقّى للدور المحدد بدل إنشاء حساب جديد.
        </p>
        <button className="btn-primary">إضافة الموظف</button>
      </form>

      {/* recent staff activity */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">
          آخر نشاطات الفريق
        </div>
        {recentActions.length === 0 ? (
          <p className="p-6 text-sm text-neutral-400 text-center">لا يوجد نشاط بعد</p>
        ) : (
          <ul className="divide-y divide-neutral-50">
            {recentActions.map((log) => (
              <li key={log.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="font-semibold text-xs shrink-0">
                    {(log.actorId && actorNames.get(log.actorId)) ?? "نظام"}
                  </span>
                  <span className="font-mono text-[10px] bg-neutral-100 rounded px-1.5 py-0.5 shrink-0">
                    {log.action}
                  </span>
                  <span className="text-neutral-500 text-xs truncate">{log.detail}</span>
                </div>
                <span className="text-xs text-neutral-400 shrink-0" suppressHydrationWarning>
                  {timeAgo(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
