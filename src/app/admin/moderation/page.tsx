import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AdminActionForm } from "@/components/AdminActionForm";
import { Megaphone, ShieldBan, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { addBannedWordAction, broadcastAction, deleteBannedWordAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "الإشراف والإشعارات" };

export default async function AdminModerationPage() {
  await requireStaff(["ADMIN"], "moderation.manage");
  const words = await db.bannedWord.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader section="moderation">الإشراف والإشعارات العامة</AdminPageHeader>

      {/* banned words */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <ShieldBan className="size-5 text-red-600" />
          الكلمات والسلع المحظورة
        </h2>
        <p className="text-sm text-neutral-500">
          أي إعلان أو تعليق أو رسالة تحتوي كلمة من هذه القائمة يُرفض تلقائياً. تُخزن الكلمات بصيغة
          مطبّعة (بدون همزات وتشكيل) لتغطية جميع أشكال الكتابة.
        </p>
        <AdminActionForm action={addBannedWordAction} className="flex gap-2 max-w-sm">
          <input
            name="word"
            className="input"
            placeholder="أضف كلمة محظورة..."
            required
            minLength={2}
          />
          <button className="btn-danger shrink-0">إضافة</button>
        </AdminActionForm>
        <div className="flex flex-wrap gap-2">
          {words.map((w) => (
            <AdminActionForm key={w.id} action={deleteBannedWordAction}>
              <input type="hidden" name="wordId" value={w.id} />
              <button className="badge bg-red-50 text-red-700 border border-red-100 cursor-pointer hover:bg-red-100">
                {w.word}
                <X className="size-3" />
              </button>
            </AdminActionForm>
          ))}
          {words.length === 0 && <p className="text-sm text-neutral-400">لا توجد كلمات محظورة</p>}
        </div>
      </div>

      {/* broadcast */}
      <AdminActionForm
        action={broadcastAction}
        className="card p-5 space-y-4"
        confirm="إرسال هذا الإشعار لجميع المستخدمين؟"
      >
        <h2 className="font-bold flex items-center gap-2">
          <Megaphone className="size-5 text-primary-500" />
          إشعار عام لجميع المستخدمين
        </h2>
        <p className="text-sm text-neutral-500">
          يصل الإشعار لكل المستخدمين داخل الموقع — استخدمه للإعلانات المهمة أو عند تحديث الشروط
          والأحكام.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">العنوان</label>
            <input
              name="title"
              className="input"
              required
              minLength={3}
              placeholder="تحديث الشروط والأحكام"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              رابط <span className="text-neutral-400">(اختياري)</span>
            </label>
            <input name="link" className="input" dir="ltr" placeholder="/terms" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">نص الإشعار</label>
          <textarea name="body" className="input min-h-24 py-3" required minLength={5} />
        </div>
        <button className="btn-primary">إرسال للجميع</button>
      </AdminActionForm>
    </div>
  );
}
