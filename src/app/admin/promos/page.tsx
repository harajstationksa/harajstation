import { BadgePercent, Gift, Plus, Trash2, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { allSettings } from "@/lib/settings";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import {
  createPromoCodeAction,
  deletePromoCodeAction,
  saveReferralSettingsAction,
  togglePromoCodeAction,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "الإحالة وأكواد الخصم" };

export default async function AdminPromosPage() {
  await requireStaff(["ADMIN"]);
  const [settings, promos, referredCount, paidAgg, topReferrers] = await Promise.all([
    allSettings(),
    db.promoCode.findMany({ orderBy: { createdAt: "desc" } }),
    db.user.count({ where: { referredById: { not: null } } }),
    db.referralEarning.aggregate({ _sum: { points: true } }),
    db.referralEarning.groupBy({
      by: ["referrerId"],
      _sum: { points: true },
      _count: true,
      orderBy: { _sum: { points: "desc" } },
      take: 5,
    }),
  ]);
  const totalPaid = paidAgg._sum.points ?? 0;

  const referrerUsers = topReferrers.length
    ? await db.user.findMany({
        where: { id: { in: topReferrers.map((r) => r.referrerId) } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nameOf = (id: string) => referrerUsers.find((u) => u.id === id);

  return (
    <div className="space-y-6">
      <h1 className="section-title flex items-center gap-2">
        <BadgePercent className="size-6 text-primary-500" />
        الإحالة وأكواد الخصم
      </h1>

      {/* ── referral program ── */}
      <form action={saveReferralSettingsAction} className="card p-5 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <UserPlus className="size-5 text-neutral-500" />
          برنامج الإحالة
        </h2>
        <div className="flex items-end gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm font-medium mb-2.5">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={settings.REFERRAL_ENABLED === "1"}
              className="size-4 accent-primary-500"
            />
            تفعيل برنامج الإحالة
          </label>
          <div>
            <label className="block text-sm font-medium mb-1.5">نسبة العمولة (%)</label>
            <input
              name="percent"
              className="input w-28"
              dir="ltr"
              inputMode="numeric"
              defaultValue={settings.REFERRAL_PERCENT}
            />
          </div>
          <button className="btn-primary mb-0.5">حفظ</button>
        </div>
        <p className="text-xs text-neutral-400">
          عند كل عملية شحن نقاط يقوم بها مستخدم مسجَّل عبر كود إحالة، يحصل صاحب الكود تلقائياً
          على هذه النسبة من نقاط الشحنة (بدون بونص أكواد الخصم). التغيير يسري فوراً على الشحنات الجديدة.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-neutral-50 p-3 text-center">
            <p className="font-display font-extrabold text-2xl">{referredCount.toLocaleString("en-US")}</p>
            <p className="text-xs text-neutral-500 mt-0.5">مستخدم سجّل عبر إحالة</p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-3 text-center">
            <p className="font-display font-extrabold text-2xl">{totalPaid.toLocaleString("en-US")}</p>
            <p className="text-xs text-neutral-500 mt-0.5">نقطة مكافآت مدفوعة</p>
          </div>
        </div>
        {topReferrers.length > 0 && (
          <div>
            <p className="text-sm font-bold mb-2">أعلى المحيلين</p>
            <ul className="divide-y divide-neutral-50 text-sm">
              {topReferrers.map((r) => {
                const u = nameOf(r.referrerId);
                return (
                  <li key={r.referrerId} className="py-2 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-medium">{u?.name ?? "مستخدم محذوف"}</span>{" "}
                      <span className="text-xs text-neutral-400" dir="ltr">{u?.email}</span>
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {r._count} عملية — <span className="text-success font-bold">+{(r._sum.points ?? 0).toLocaleString("en-US")}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </form>

      {/* ── promo codes ── */}
      <div>
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Gift className="size-5 text-neutral-500" />
          أكواد الخصم (بونص نقاط عند الشحن)
        </h2>

        {/* create */}
        <form action={createPromoCodeAction} className="card p-4 mb-3 flex items-end gap-3 flex-wrap border-dashed">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">الكود</label>
            <input name="code" className="input w-36" dir="ltr" placeholder="RAMADAN30" maxLength={30} required />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">نسبة البونص (%)</label>
            <input name="percent" className="input w-28" dir="ltr" inputMode="numeric" placeholder="20" required />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">حد الاستخدام (0 = بلا حد)</label>
            <input name="maxUses" className="input w-32" dir="ltr" inputMode="numeric" defaultValue="0" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">تاريخ الانتهاء (اختياري)</label>
            <input name="expiresAt" type="date" className="input w-40" dir="ltr" />
          </div>
          <label className="flex items-center gap-1.5 text-sm mb-2.5">
            <input type="checkbox" name="oncePerUser" defaultChecked className="size-4 accent-primary-500" />
            مرة لكل مستخدم
          </label>
          <button className="btn-secondary mb-0.5">
            <Plus className="size-4" />
            إنشاء الكود
          </button>
        </form>

        {/* list */}
        {promos.length === 0 ? (
          <p className="card p-6 text-sm text-neutral-400 text-center">لا توجد أكواد بعد — أنشئ أول كود من الأعلى</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs text-neutral-500 border-b border-neutral-100">
                  <th className="px-4 py-3 font-medium">الكود</th>
                  <th className="px-4 py-3 font-medium">البونص</th>
                  <th className="px-4 py-3 font-medium">الاستخدام</th>
                  <th className="px-4 py-3 font-medium">الانتهاء</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {promos.map((p) => {
                  const expired = p.expiresAt && p.expiresAt < new Date();
                  const exhausted = p.maxUses > 0 && p.usedCount >= p.maxUses;
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-mono font-bold" dir="ltr">{p.code}</td>
                      <td className="px-4 py-3">{p.percent}%</td>
                      <td className="px-4 py-3" dir="ltr">
                        {p.usedCount} / {p.maxUses || "∞"}
                        {p.oncePerUser && <span className="text-xs text-neutral-400"> (مرة/مستخدم)</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500">
                        {p.expiresAt ? p.expiresAt.toLocaleDateString("ar-SA") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {!p.isActive ? (
                          <span className="badge bg-neutral-100 text-neutral-500">معطل</span>
                        ) : expired ? (
                          <span className="badge bg-amber-50 text-amber-700">منتهي</span>
                        ) : exhausted ? (
                          <span className="badge bg-amber-50 text-amber-700">مستنفد</span>
                        ) : (
                          <span className="badge bg-green-50 text-green-700">نشط</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <form action={togglePromoCodeAction}>
                            <input type="hidden" name="promoId" value={p.id} />
                            <ConfirmSubmit className="badge bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                              {p.isActive ? "تعطيل" : "تفعيل"}
                            </ConfirmSubmit>
                          </form>
                          <form action={deletePromoCodeAction}>
                            <input type="hidden" name="promoId" value={p.id} />
                            <ConfirmSubmit
                              confirm={`حذف الكود ${p.code}؟ سيُحذف سجل استخداماته أيضاً.`}
                              className="badge bg-red-50 text-red-600 hover:bg-red-100"
                            >
                              <Trash2 className="size-3.5" />
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-neutral-400 mt-2">
          يضيف الكود نسبة بونص من نقاط الباقة عند الشحن — يدخله المستخدم في محفظة النقاط قبل الدفع،
          ويُحتسب الاستخدام فقط بعد تأكيد الدفع.
        </p>
      </div>
    </div>
  );
}
