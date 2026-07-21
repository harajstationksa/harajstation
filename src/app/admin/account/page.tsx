import { KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/constants";
import { Avatar } from "@/components/Avatar";
import { updateMyAccountAction, setMyPasswordAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "حسابي" };

export default async function AdminAccountPage() {
  const me = await requireStaff(STAFF_ROLES);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <UserCog className="size-6 text-primary-500" />
          حسابي
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          بيانات دخولك لبوابة الإدارة — رمز البريد مطلوب في كل دخول مهما كانت إعداداتك
        </p>
      </div>

      {/* identity */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={me.name} color={me.avatarColor} src={me.avatarUrl} className="size-12" />
          <div>
            <p className="font-bold">{me.name}</p>
            <span className="badge bg-neutral-900 text-white text-[10px]">
              {ROLE_LABELS[me.role] ?? me.role}
            </span>
          </div>
        </div>
        <form action={updateMyAccountAction} className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">الاسم</label>
            <input name="name" className="input" defaultValue={me.name} required minLength={2} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">البريد الإلكتروني</label>
            <input name="email" className="input" dir="ltr" type="email" defaultValue={me.email} required />
          </div>
          <div className="sm:col-span-2">
            <button className="btn-primary">حفظ البيانات</button>
          </div>
        </form>
      </div>

      {/* password */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <KeyRound className="size-5 text-primary-500" />
          كلمة المرور
        </h2>
        {me.passwordEnabled ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0" />
            كلمة المرور مفعّلة — الدخول يتطلبها بالإضافة لرمز البريد
          </p>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            حسابك بدون كلمة مرور حالياً — الدخول برمز البريد فقط. فعّل كلمة مرور
            لإضافة طبقة حماية ثانية.
          </p>
        )}
        <form action={setMyPasswordAction} className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {me.passwordEnabled ? "كلمة مرور جديدة" : "كلمة المرور"}
            </label>
            <input name="password" className="input" dir="ltr" type="password" required minLength={10} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">تأكيد كلمة المرور</label>
            <input name="confirm" className="input" dir="ltr" type="password" required minLength={10} />
          </div>
          <p className="text-xs text-neutral-400 sm:col-span-2">
            10 أحرف على الأقل. بعد التفعيل يصير الدخول: كلمة المرور ثم رمز البريد.
          </p>
          <div className="sm:col-span-2">
            <button className="btn-primary">
              {me.passwordEnabled ? "تغيير كلمة المرور" : "تفعيل كلمة المرور"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
