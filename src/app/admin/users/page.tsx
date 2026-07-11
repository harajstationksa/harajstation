import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { CredibilityBadge } from "@/components/CredibilityBadge";
import { adjustCredibilityAction, adjustUserPointsAction, toggleBanAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "إدارة المستخدمين" };

export default async function AdminUsersPage() {
  const staff = await requireStaff(["ADMIN", "MODERATOR", "SUPPORT"]);
  const canBan = ["ADMIN", "MODERATOR"].includes(staff.role);
  const canAdjust = ["ADMIN", "SUPPORT"].includes(staff.role);

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { listings: true } } },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="section-title">إدارة المستخدمين</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {users.length} مستخدم مسجل
          {!canBan && " — صلاحيتك: عرض فقط"}
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-175">
          <thead>
            <tr className="border-b border-neutral-100 text-right text-xs text-neutral-500">
              <th className="p-3 font-semibold">المستخدم</th>
              <th className="p-3 font-semibold">الجوال</th>
              <th className="p-3 font-semibold">المصداقية</th>
              <th className="p-3 font-semibold">النقاط</th>
              <th className="p-3 font-semibold">الإعلانات</th>
              <th className="p-3 font-semibold">التسجيل</th>
              <th className="p-3 font-semibold">الحالة</th>
              {(canBan || canAdjust) && <th className="p-3 font-semibold">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-neutral-50/60">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: u.avatarColor }}
                    >
                      {u.name.charAt(0)}
                    </span>
                    <div>
                      <p className="font-semibold flex items-center gap-1.5">
                        {u.name}
                        {u.isPro && <span className="badge bg-neutral-900 text-primary-400 text-[10px]">PRO</span>}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {ROLE_LABELS[u.role] ?? u.role} · {u.city}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-xs text-neutral-500" dir="ltr">{u.phone}</td>
                <td className="p-3"><CredibilityBadge score={u.credibility} compact /></td>
                <td className="p-3 tabular-nums text-amber-600 font-semibold">{u.points}</td>
                <td className="p-3 tabular-nums">{u._count.listings}</td>
                <td className="p-3 text-xs text-neutral-500">{formatDate(u.createdAt)}</td>
                <td className="p-3">
                  {u.isBanned ? (
                    <span className="badge bg-red-50 text-red-600">محظور</span>
                  ) : (
                    <span className="badge bg-green-50 text-green-700">نشط</span>
                  )}
                </td>
                {(canBan || canAdjust) && (
                  <td className="p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {canBan && u.role !== "ADMIN" && (
                        <form action={toggleBanAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button
                            className={`badge cursor-pointer ${
                              u.isBanned
                                ? "bg-green-600 text-white hover:bg-green-700"
                                : "bg-red-600 text-white hover:bg-red-700"
                            }`}
                          >
                            {u.isBanned ? "رفع الحظر" : "حظر"}
                          </button>
                        </form>
                      )}
                      {canAdjust && u.role === "USER" && (
                        <>
                          <form action={adjustCredibilityAction} className="flex items-center gap-1">
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="reason" value="تعديل إداري" />
                            <input
                              name="delta"
                              className="w-14 rounded border border-neutral-200 px-1.5 py-0.5 text-xs text-center"
                              placeholder="±مصداقية"
                              dir="ltr"
                            />
                            <button className="badge bg-neutral-800 text-white cursor-pointer hover:bg-neutral-700">
                              مصداقية
                            </button>
                          </form>
                          <form action={adjustUserPointsAction} className="flex items-center gap-1">
                            <input type="hidden" name="userId" value={u.id} />
                            <input
                              name="delta"
                              className="w-14 rounded border border-neutral-200 px-1.5 py-0.5 text-xs text-center"
                              placeholder="±نقاط"
                              dir="ltr"
                            />
                            <button className="badge bg-amber-500 text-white cursor-pointer hover:bg-amber-600">
                              نقاط
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
