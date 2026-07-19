import { Coins, Plus, Settings, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { allSettings } from "@/lib/settings";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import {
  deletePointPackageAction,
  savePointPackageAction,
  saveSettingsAction,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "النقاط والأسعار" };

export default async function AdminPointsPage() {
  await requireStaff(["ADMIN"]);
  const [packages, settings] = await Promise.all([
    db.pointPackage.findMany({ orderBy: { sortOrder: "asc" } }),
    allSettings(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="section-title flex items-center gap-2">
        <Coins className="size-6 text-primary-500" />
        النقاط والأسعار
      </h1>

      {/* pricing settings */}
      <form action={saveSettingsAction} className="card p-5 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <Settings className="size-5 text-neutral-500" />
          إعدادات تسعير النقاط
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">تكلفة الإعلان الممول (نقاط / يوم)</label>
            <input name="CAMPAIGN_POINTS_PER_DAY" className="input" dir="ltr" defaultValue={settings.CAMPAIGN_POINTS_PER_DAY} inputMode="numeric" />
            <p className="text-xs text-neutral-400 mt-1">سعر اليوم الواحد — يُضرب في عدد أيام الحملة عند إطلاقها</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">مدد الحملة المتاحة (أيام)</label>
            <input name="CAMPAIGN_DAY_OPTIONS" className="input" dir="ltr" defaultValue={settings.CAMPAIGN_DAY_OPTIONS} placeholder="3,5,7,15,30" />
            <p className="text-xs text-neutral-400 mt-1">قائمة مفصولة بفواصل — تظهر كخيارات للمعلن</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">تكلفة تمييز الإعلان (نقاط / 7 أيام)</label>
            <input name="FEATURE_POINT_COST" className="input" dir="ltr" defaultValue={settings.FEATURE_POINT_COST} inputMode="numeric" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">تكلفة تجديد الإعلان (نقاط)</label>
            <input name="BUMP_POINT_COST" className="input" dir="ltr" defaultValue={settings.BUMP_POINT_COST} inputMode="numeric" />
            <p className="text-xs text-neutral-400 mt-1">تجديد الإعلان يرفعه أول القائمة قبل موعد التجديد المجاني</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">فترة التجديد المجاني (ساعات)</label>
            <input name="BUMP_FREE_HOURS" className="input" dir="ltr" defaultValue={settings.BUMP_FREE_HOURS} inputMode="numeric" />
            <p className="text-xs text-neutral-400 mt-1">كل بائع يجدد مجاناً مرة كل هذه المدة</p>
          </div>
        </div>
        <button className="btn-primary">حفظ الإعدادات</button>
        <p className="text-xs text-neutral-400">
          أي تغيير هنا يسري فوراً على الحملات الجديدة — الحملات الجارية لا تتأثر.
        </p>
      </form>

      {/* point packages */}
      <div>
        <h2 className="font-bold mb-3">باقات شحن النقاط</h2>
        <div className="grid gap-3">
          {packages.map((pkg) => (
            <div key={pkg.id} className="card p-4 flex items-end gap-3 flex-wrap">
              <form action={savePointPackageAction} className="flex items-end gap-3 flex-wrap flex-1">
                <input type="hidden" name="packageId" value={pkg.id} />
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">النقاط</label>
                  <input name="points" className="input w-28" dir="ltr" defaultValue={pkg.points} inputMode="numeric" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">هدية</label>
                  <input name="bonus" className="input w-24" dir="ltr" defaultValue={pkg.bonus} inputMode="numeric" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">السعر (ر.س)</label>
                  <input name="price" className="input w-28" dir="ltr" defaultValue={pkg.price} inputMode="numeric" />
                </div>
                <label className="flex items-center gap-1.5 text-sm mb-2.5">
                  <input type="checkbox" name="isActive" defaultChecked={pkg.isActive} className="size-4 accent-primary-500" />
                  نشطة
                </label>
                <button className="btn-primary mb-0.5">حفظ</button>
              </form>
              <form action={deletePointPackageAction} className="mb-0.5">
                <input type="hidden" name="packageId" value={pkg.id} />
                <ConfirmSubmit confirm="حذف الباقة؟" className="badge bg-red-50 text-red-600 hover:bg-red-100">
                  <Trash2 className="size-3.5" />
                </ConfirmSubmit>
              </form>
            </div>
          ))}
        </div>

        {/* create package */}
        <form action={savePointPackageAction} className="card p-4 mt-3 flex items-end gap-3 flex-wrap border-dashed">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">النقاط</label>
            <input name="points" className="input w-28" dir="ltr" placeholder="100" inputMode="numeric" required />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">هدية</label>
            <input name="bonus" className="input w-24" dir="ltr" placeholder="0" inputMode="numeric" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">السعر (ر.س)</label>
            <input name="price" className="input w-28" dir="ltr" placeholder="10" inputMode="numeric" required />
          </div>
          <button className="btn-secondary mb-0.5">
            <Plus className="size-4" />
            إضافة باقة
          </button>
        </form>
      </div>
    </div>
  );
}
