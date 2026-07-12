import { Gift, Plus, Trash2, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { getFreeTierConfig } from "@/lib/settings";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import {
  createPlanAction,
  deletePlanAction,
  saveFreeTierAction,
  updatePlanAction,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "الباقات والأسعار" };

const CORE = ["FREE", "PRO_MONTHLY"];

export default async function AdminPlansPage() {
  await requireStaff(["ADMIN"]);
  const [plans, freeTier, activePromos] = await Promise.all([
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    getFreeTierConfig(),
    // time-limited PRO = accounts granted by this promo (manual PRO has no expiry)
    db.user.count({ where: { isPro: true, proUntil: { not: null } } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Wallet className="size-6 text-primary-500" />
          الباقات والأسعار
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          التعديلات تنعكس فوراً على صفحة الاشتراكات وحدود النشر والمتاجر والنقاط
          اليومية لكل مستخدم
        </p>
      </div>

      {/* free-tier launch promo */}
      <form
        action={saveFreeTierAction}
        className={`card p-5 space-y-4 ${freeTier.enabled ? "ring-2 ring-primary-500" : ""}`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold flex items-center gap-2">
            <Gift className="size-5 text-primary-500" />
            الفترة المجانية (Free Tier)
            {freeTier.enabled ? (
              <span className="badge bg-success text-white">مفعّلة</span>
            ) : (
              <span className="badge bg-neutral-100 text-neutral-500">متوقفة</span>
            )}
          </h2>
          <span className="text-xs text-neutral-400">
            {activePromos} حساب برو مؤقت نشط حالياً
          </span>
        </div>
        <p className="text-sm text-neutral-500">
          عند التفعيل يحصل كل حساب جديد على عضوية برو مجانية تلقائياً للمدة
          المحددة، وتنتهي وحدها بعد انقضائها (يرجع الحساب للباقة المجانية).
          إيقاف الخاصية لا يسحب العضويات الممنوحة سابقاً، ولا تتأثر حسابات برو
          الدائمة الممنوحة يدوياً.
        </p>
        <div className="flex items-end gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm font-medium pb-2.5">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={freeTier.enabled}
              className="size-4 accent-primary-500"
            />
            تفعيل الفترة المجانية
          </label>
          <div>
            <label className="block text-sm font-medium mb-1.5">مدة العضوية (بالأيام)</label>
            <input
              name="days"
              className="input w-32"
              dir="ltr"
              type="number"
              min={1}
              max={365}
              defaultValue={freeTier.days}
              required
            />
          </div>
          <button className="btn-primary">حفظ</button>
        </div>
      </form>

      <div className="grid gap-5">
        {plans.map((plan) => {
          const features = (JSON.parse(plan.features) as string[]).join("\n");
          const isCore = CORE.includes(plan.key);
          return (
            <form key={plan.id} action={updatePlanAction} className="card p-5 space-y-4">
              <input type="hidden" name="planId" value={plan.id} />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-mono text-xs bg-neutral-100 rounded px-2 py-1">{plan.key}</span>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" name="highlight" defaultChecked={plan.highlight} className="size-4 accent-primary-500" />
                    الأكثر شيوعاً
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" name="isActive" defaultChecked={plan.isActive} className="size-4 accent-primary-500" />
                    نشطة
                  </label>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">اسم الباقة</label>
                  <input name="name" className="input" defaultValue={plan.name} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">السعر (ر.س)</label>
                  <input name="price" className="input" dir="ltr" defaultValue={plan.price} inputMode="numeric" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">الفترة</label>
                  <input name="period" className="input" defaultValue={plan.period} placeholder="شهرياً" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">حد الإعلانات</label>
                  <input name="maxListings" className="input" dir="ltr" defaultValue={plan.maxListings} inputMode="numeric" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">حد المزادات</label>
                  <input name="maxAuctions" className="input" dir="ltr" defaultValue={plan.maxAuctions} inputMode="numeric" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">حد المتاجر</label>
                  <input name="maxStores" className="input" dir="ltr" defaultValue={plan.maxStores} inputMode="numeric" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">النقاط اليومية المجانية</label>
                  <input name="dailyPoints" className="input" dir="ltr" defaultValue={plan.dailyPoints} inputMode="numeric" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">المميزات (كل ميزة في سطر)</label>
                <textarea name="features" className="input min-h-24 py-3" defaultValue={features} />
              </div>

              <button className="btn-primary">حفظ الباقة</button>
              {isCore && (
                <p className="text-xs text-neutral-400">
                  باقة أساسية لا يمكن حذفها (يعتمد عليها النظام).
                </p>
              )}
            </form>
          );
        })}
      </div>

      {/* delete forms for non-core plans */}
      {plans.some((p) => !CORE.includes(p.key)) && (
        <div className="flex flex-wrap gap-2">
          {plans.filter((p) => !CORE.includes(p.key)).map((p) => (
            <form key={p.id} action={deletePlanAction}>
              <input type="hidden" name="planId" value={p.id} />
              <ConfirmSubmit confirm={`حذف باقة "${p.name}"؟`} className="badge bg-red-50 text-red-600 hover:bg-red-100">
                <Trash2 className="size-3.5" />
                حذف {p.name}
              </ConfirmSubmit>
            </form>
          ))}
        </div>
      )}

      {/* create new plan */}
      <form action={createPlanAction} className="card p-5 space-y-4 border-dashed">
        <h2 className="font-bold flex items-center gap-2">
          <Plus className="size-5 text-primary-500" />
          إضافة باقة جديدة
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <input name="name" className="input" placeholder="اسم الباقة" required />
          <input name="price" className="input" dir="ltr" placeholder="السعر" inputMode="numeric" required />
          <input name="period" className="input" placeholder="الفترة (شهرياً)" />
          <input name="maxListings" className="input" dir="ltr" placeholder="حد الإعلانات" inputMode="numeric" />
          <input name="maxAuctions" className="input" dir="ltr" placeholder="حد المزادات" inputMode="numeric" />
          <input name="maxStores" className="input" dir="ltr" placeholder="حد المتاجر" inputMode="numeric" />
          <input name="dailyPoints" className="input" dir="ltr" placeholder="نقاط يومية" inputMode="numeric" />
        </div>
        <button className="btn-secondary">إنشاء الباقة</button>
      </form>
    </div>
  );
}
