import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminActionForm } from "@/components/AdminActionForm";
import { Gift, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { getFreeTierConfig } from "@/lib/settings";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { deletePlanAction, saveFreeTierAction, updatePlanAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "الباقات والأسعار" };

const CORE = ["FREE", "PRO_MONTHLY"];

export default async function AdminPlansPage() {
  await requireStaff(["ADMIN"], "plans.manage");
  const [plans, freeTier, activePromos] = await Promise.all([
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    getFreeTierConfig(),
    // time-limited PRO = accounts granted by this promo (manual PRO has no expiry)
    db.user.count({ where: { isPro: true, proUntil: { not: null } } }),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        section="plans"
        description={
          <>
            التعديلات تنعكس فوراً على صفحة الاشتراكات وحدود النشر والمتاجر والنقاط اليومية لكل
            مستخدم
          </>
        }
      >
        الباقات والأسعار
      </AdminPageHeader>

      {/* free-tier launch promo */}
      <AdminActionForm
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
          <span className="text-xs text-neutral-400">{activePromos} حساب برو مؤقت نشط حالياً</span>
        </div>
        <p className="text-sm text-neutral-500">
          عند التفعيل يحصل كل حساب جديد على عضوية برو مجانية تلقائياً للمدة المحددة، وتنتهي وحدها
          بعد انقضائها (يرجع الحساب للباقة المجانية). إيقاف الخاصية لا يسحب العضويات الممنوحة
          سابقاً، ولا تتأثر حسابات برو الدائمة الممنوحة يدوياً.
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
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-1">
              مدة العضوية (بالأيام)
            </label>
            <input
              name="days"
              className="input w-32"
              dir="ltr"
              type="number"
              min={1}
              max={365}
              defaultValue={freeTier.days}
              required
              id="a11y-page-1"
            />
          </div>
          <button className="btn-primary">حفظ</button>
        </div>
      </AdminActionForm>

      <div className="grid gap-5">
        {plans
          .filter((p) => CORE.includes(p.key))
          .map((plan) => {
            const features = (JSON.parse(plan.features) as string[]).join("\n");
            const isCore = CORE.includes(plan.key);
            return (
              <AdminActionForm
                key={plan.id}
                action={updatePlanAction}
                className="card p-5 space-y-4"
              >
                <input type="hidden" name="planId" value={plan.id} />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-neutral-100 rounded px-2 py-1">
                    {plan.key}
                  </span>
                  <div className="flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="highlight"
                        defaultChecked={plan.highlight}
                        className="size-4 accent-primary-500"
                      />
                      الأكثر شيوعاً
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="isActive"
                        checked
                        disabled
                        className="size-4 accent-primary-500"
                      />
                      نشطة
                    </label>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="text-sm">
                    اسم الباقة بالإنجليزية
                    <input
                      className="input mt-1"
                      name="nameEn"
                      dir="ltr"
                      maxLength={100}
                      defaultValue={plan.nameEn}
                    />
                  </label>
                  <label className="text-sm">
                    الفترة بالإنجليزية
                    <input
                      className="input mt-1"
                      name="periodEn"
                      dir="ltr"
                      maxLength={80}
                      defaultValue={plan.periodEn}
                    />
                  </label>
                  <label className="text-sm">
                    المزايا بالإنجليزية — سطر لكل ميزة
                    <textarea
                      className="input mt-1"
                      name="featuresEn"
                      dir="ltr"
                      maxLength={5000}
                      defaultValue={(JSON.parse(plan.featuresEn) as string[]).join("\n")}
                    />
                  </label>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-2">
                      اسم الباقة
                    </label>
                    <input
                      name="name"
                      className="input"
                      defaultValue={plan.name}
                      required
                      id="a11y-page-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-3">
                      السعر (ر.س)
                    </label>
                    <input
                      name="price"
                      className="input"
                      dir="ltr"
                      defaultValue={plan.price}
                      inputMode="numeric"
                      required
                      id="a11y-page-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-4">
                      الفترة
                    </label>
                    <input
                      name="period"
                      className="input"
                      defaultValue={plan.period}
                      placeholder="شهرياً"
                      id="a11y-page-4"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-5">
                      حد الإعلانات
                    </label>
                    <input
                      name="maxListings"
                      className="input"
                      dir="ltr"
                      defaultValue={plan.maxListings}
                      inputMode="numeric"
                      id="a11y-page-5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-6">
                      حد المزادات
                    </label>
                    <input
                      name="maxAuctions"
                      className="input"
                      dir="ltr"
                      defaultValue={plan.maxAuctions}
                      inputMode="numeric"
                      id="a11y-page-6"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-7">
                      حد المتاجر
                    </label>
                    <input
                      name="maxStores"
                      className="input"
                      dir="ltr"
                      defaultValue={plan.maxStores}
                      inputMode="numeric"
                      id="a11y-page-7"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-8">
                      النقاط اليومية المجانية
                    </label>
                    <input
                      name="dailyPoints"
                      className="input"
                      dir="ltr"
                      defaultValue={plan.dailyPoints}
                      inputMode="numeric"
                      id="a11y-page-8"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-9">
                    المميزات (كل ميزة في سطر)
                  </label>
                  <textarea
                    name="features"
                    className="input min-h-24 py-3"
                    defaultValue={features}
                    id="a11y-page-9"
                  />
                </div>

                <button className="btn-primary">حفظ الباقة</button>
                {isCore && (
                  <p className="text-xs text-neutral-400">
                    باقة أساسية لا يمكن حذفها (يعتمد عليها النظام).
                  </p>
                )}
              </AdminActionForm>
            );
          })}
      </div>

      {/* delete forms for non-core plans */}
      {plans.some((p) => !CORE.includes(p.key)) && (
        <div className="flex flex-wrap gap-2">
          {plans
            .filter((p) => !CORE.includes(p.key))
            .map((p) => (
              <AdminActionForm key={p.id} action={deletePlanAction}>
                <input type="hidden" name="planId" value={p.id} />
                <ConfirmSubmit
                  confirm={`حذف باقة "${p.name}"؟`}
                  className="badge bg-red-50 text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="size-3.5" />
                  حذف {p.name}
                </ConfirmSubmit>
              </AdminActionForm>
            ))}
        </div>
      )}

      <p className="text-sm text-neutral-500">
        يدعم الموقع المجانية وبرو فقط. تفعيل برو يتم من إدارة المستخدمين؛ السعر المعروض تعريفي ولا
        ينشئ عملية شراء نقاط أو اشتراك.
      </p>
    </div>
  );
}
