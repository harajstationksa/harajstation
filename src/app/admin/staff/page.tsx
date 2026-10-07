import { AdminPageHeader, AdminStatCard } from "@/components/AdminPageHeader";
import { publicAsset } from "@/lib/admin";
import Link from "next/link";
import { AdminActionForm } from "@/components/AdminActionForm";
import { ChevronDown, UserX } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { StaffCreateForm } from "@/components/StaffCreateForm";
import { StaffPermissionGrid } from "@/components/StaffPermissionGrid";
import { parseStaffPermissions } from "@/lib/staff-permissions";
import {
  resendStaffInviteAction,
  removeStaffAction,
  requestStaffChangeCodeAction,
  updateStaffPermissionsAction,
  updateStaffRoleAction,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "إدارة الموظفين" };

const ROLE_DESC: Record<string, string> = {
  ADMIN: "صلاحيات كاملة على كل شيء",
  MODERATOR: "المستخدمون والإعلانات والمزايدات والبلاغات",
  SUPPORT: "النزاعات والمصداقية والنقاط والبلاغات",
  ACCOUNTANT: "التقارير المالية فقط",
  STAFF: "صلاحيات تحدد لكل موظف",
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
      <AdminPageHeader section="staff" />
      <div className="admin-staff-stats grid grid-cols-3 gap-2 sm:gap-4">
        <AdminStatCard label="فريق الإدارة" value={staff.length} hint="جميع الرتب الإدارية" />
        <AdminStatCard
          label="صلاحيات مخصصة"
          value={staff.filter((u) => u.role === "STAFF").length}
          hint="وصول محدد لكل عضو"
        />
        <AdminStatCard
          label="حسابات موقوفة"
          value={staff.filter((u) => u.isBanned).length}
          hint="لا يمكنها الدخول إلى اللوحة"
        />
      </div>

      {/* staff table */}
      <div className="admin-table-wrap card overflow-x-auto">
        <table role="table" className="admin-responsive-table w-full text-sm min-w-160">
          <thead role="rowgroup">
            <tr
              role="row"
              className="border-b border-neutral-100 text-right text-xs text-neutral-500"
            >
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                الموظف
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                الدور
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                الصلاحيات
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                منذ
              </th>
              <th role="columnheader" scope="col" className="p-3 font-semibold">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup" className="divide-y divide-neutral-50">
            {staff.map((u) => {
              const isSelf = u.id === me.id;
              return (
                <tr role="row" key={u.id} className="hover:bg-neutral-50/60">
                  <td role="cell" data-label="الموظف" data-card-header="true" className="p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={u.name}
                        color={u.avatarColor}
                        src={u.avatarUrl ? publicAsset(u.avatarUrl) : undefined}
                        className="size-10 text-sm shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold flex flex-wrap items-center gap-1.5">
                          {u.name}
                          {isSelf && (
                            <span className="badge bg-primary-50 text-primary-700 text-[10px]">
                              أنت
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-neutral-400" dir="ltr">
                          {u.email}
                        </p>
                        {u.isBanned && (
                          <span className="text-[10px] text-red-600">الحساب موقوف</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td
                    role="cell"
                    data-label="الرتبة الوظيفية"
                    data-card-wide="true"
                    className="p-3"
                  >
                    {isSelf ? (
                      <span className="badge bg-neutral-900 text-white">{ROLE_LABELS[u.role]}</span>
                    ) : (
                      <AdminActionForm
                        action={updateStaffRoleAction}
                        stepUpAction={requestStaffChangeCodeAction}
                        className="admin-staff-role-form flex flex-wrap items-center gap-2 max-w-72"
                      >
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          aria-label={`الرتبة الوظيفية لـ ${u.name}`}
                          className="input min-h-8 py-0 text-xs w-28"
                          defaultValue={u.role}
                        >
                          {STAFF_ROLES.filter((r) => r !== "STAFF").map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                          {u.role === "STAFF" && (
                            <option value="STAFF" disabled>
                              {ROLE_LABELS.STAFF}
                            </option>
                          )}
                        </select>
                        <button className="act-btn bg-neutral-800 text-white hover:bg-neutral-700">
                          حفظ
                        </button>
                      </AdminActionForm>
                    )}
                  </td>
                  <td
                    role="cell"
                    data-label="الصلاحيات"
                    data-card-wide="true"
                    className="p-3 text-xs text-neutral-500 max-w-52"
                  >
                    {u.role === "STAFF"
                      ? `${parseStaffPermissions(u.staffPermissions).length} صلاحية محددة`
                      : ROLE_DESC[u.role]}
                  </td>
                  <td role="cell" data-label="عضو منذ" className="p-3 text-xs text-neutral-400">
                    {formatDate(u.createdAt)}
                  </td>
                  <td
                    role="cell"
                    data-label="الإجراءات"
                    data-card-actions="true"
                    className="admin-staff-actions p-3 space-y-2"
                  >
                    {!isSelf && !u.isBanned && (
                      <AdminActionForm action={resendStaffInviteAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button className="btn-secondary text-xs">إعادة إرسال الدعوة</button>
                      </AdminActionForm>
                    )}
                    {!isSelf && (
                      <AdminActionForm
                        action={removeStaffAction}
                        stepUpAction={requestStaffChangeCodeAction}
                      >
                        <input type="hidden" name="userId" value={u.id} />
                        <ConfirmSubmit
                          confirm={`إزالة ${u.name} من فريق العمل؟ سيتحول لمستخدم عادي.`}
                          className="act-btn bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          <UserX className="size-3.5" />
                          إزالة
                        </ConfirmSubmit>
                      </AdminActionForm>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-bold text-lg">صلاحيات كل موظف</h2>
          <p className="text-xs text-neutral-500 mt-1">
            يمكن تحويل الأدوار غير الإدارية إلى صلاحيات مخصّصة؛ تُلغى جلساتها القديمة فور الحفظ.
          </p>
        </div>
        {staff
          .filter((u) => u.id !== me.id && u.role !== "ADMIN" && !u.isBanned)
          .map((u) => (
            <details key={u.id} className="admin-staff-permissions card p-4 group">
              <summary className="cursor-pointer flex items-center justify-between gap-3 text-sm font-semibold">
                <span className="min-w-0">
                  <span className="block">{u.name}</span>
                  <span dir="ltr" className="block text-xs text-neutral-500 font-normal mt-1">
                    {u.email}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-primary-600 text-xs">
                  <span className="max-sm:hidden">
                    {u.role === "STAFF" ? "تعديل الصلاحيات" : "تخصيص الصلاحيات"}
                  </span>
                  <ChevronDown size={18} className="transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <AdminActionForm
                action={updateStaffPermissionsAction}
                stepUpAction={requestStaffChangeCodeAction}
                className="mt-5 space-y-4"
                confirm={`حفظ صلاحيات ${u.name} وإلغاء جلساته القديمة؟`}
              >
                <input type="hidden" name="userId" value={u.id} />
                <StaffPermissionGrid
                  selected={u.role === "STAFF" ? parseStaffPermissions(u.staffPermissions) : []}
                />
                <button className="btn-primary">
                  {u.role === "STAFF" ? "حفظ الصلاحيات" : "تحويل إلى صلاحيات مخصّصة"}
                </button>
              </AdminActionForm>
            </details>
          ))}
      </section>

      <StaffCreateForm />

      {/* recent staff activity */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">
          آخر نشاطات الفريق —{" "}
          <Link href="/admin/audit" className="text-primary-600">
            السجل الكامل
          </Link>
        </div>
        {recentActions.length === 0 ? (
          <p className="p-6 text-sm text-neutral-400 text-center">لا يوجد نشاط بعد</p>
        ) : (
          <ul className="admin-activity-list divide-y divide-neutral-50">
            {recentActions.map((log) => (
              <li
                key={log.id}
                className="px-4 py-2.5 text-sm flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className="font-semibold text-xs shrink-0">
                    {log.actorId
                      ? (actorNames.get(log.actorId) ?? `حساب سابق (${log.actorId})`)
                      : "نظام"}
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
