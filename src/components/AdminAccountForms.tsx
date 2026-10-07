"use client";
import { useState } from "react";
import Link from "next/link";
import {
  requestAccountCodeAction,
  updateAccountAction,
  confirmAccountEmailAction,
  changeAccountPasswordAction,
} from "@/app/admin/account/actions";
import type { AdminResult } from "@/lib/admin";

export function AdminAccountForms({
  name,
  email,
  passwordEnabled,
}: {
  name: string;
  email: string;
  passwordEnabled: boolean;
}) {
  const [challenge, setChallenge] = useState(""),
    [stage, setStage] = useState(""),
    [message, setMessage] = useState<AdminResult | null>(null),
    [busy, setBusy] = useState(false);
  async function run(action: () => Promise<AdminResult>) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await action();
      setMessage(r);
      if (r.ok) {
        if (r.challenge) setChallenge(r.challenge);
        if (r.stage) setStage(r.stage);
        else {
          setChallenge("");
          setStage("");
        }
      }
    } catch {
      setMessage({ ok: false, message: "تعذّر الاتصال؛ حاول مجددًا" });
    } finally {
      setBusy(false);
    }
  }
  const proof = (
    <>
      <input type="hidden" name="challenge" value={challenge} />
      <label className="block text-sm">
        رمز تأكيد الهوية
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className="input mt-1"
          dir="ltr"
        />
      </label>
    </>
  );
  if (stage === "login")
    return (
      <div className="card p-5 space-y-3">
        <p role="status">{message?.message}</p>
        <Link href="/admin-login" className="btn-primary">
          تسجيل الدخول
        </Link>
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-3">
        <h2 className="font-bold">تأكيد الهوية قبل تعديل بيانات الدخول</h2>
        <p className="text-sm text-neutral-500">
          اطلب رمزًا إلى بريدك الحالي. كل رمز يُستخدم لإجراء واحد فقط.
        </p>
        <button
          disabled={busy}
          onClick={() => run(requestAccountCodeAction)}
          className="btn-secondary"
        >
          {busy ? "جارٍ الإرسال…" : "إرسال رمز التأكيد"}
        </button>
      </div>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-lg p-3 ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {message.message}
        </p>
      )}
      {stage === "email" ? (
        <form
          className="card p-5 space-y-3"
          action={(data) => run(() => confirmAccountEmailAction(data))}
        >
          <h2 className="font-bold">تأكيد البريد الجديد</h2>
          {proof}
          <button disabled={busy} className="btn-primary">
            اعتماد البريد وتسجيل الخروج
          </button>
        </form>
      ) : (
        <>
          <form
            className="card p-5 space-y-3"
            action={(data) => run(() => updateAccountAction(data))}
          >
            <h2 className="font-bold">الاسم والبريد</h2>
            <label className="block text-sm">
              الاسم
              <input
                name="name"
                defaultValue={name}
                required
                minLength={2}
                maxLength={100}
                className="input mt-1"
              />
            </label>
            <label className="block text-sm">
              البريد
              <input
                name="email"
                type="email"
                defaultValue={email}
                required
                maxLength={254}
                className="input mt-1"
                dir="ltr"
              />
            </label>
            {challenge && proof}
            <button disabled={busy || !challenge} className="btn-primary">
              حفظ البيانات
            </button>
          </form>
          <form
            className="card p-5 space-y-3"
            action={(data) => run(() => changeAccountPasswordAction(data))}
          >
            <h2 className="font-bold">{passwordEnabled ? "تغيير" : "تفعيل"} كلمة المرور</h2>
            <label className="block text-sm">
              كلمة المرور الجديدة
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={72}
                className="input mt-1"
                dir="ltr"
              />
            </label>
            <label className="block text-sm">
              التأكيد
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={72}
                className="input mt-1"
                dir="ltr"
              />
            </label>
            {challenge && proof}
            <button disabled={busy || !challenge} className="btn-primary">
              حفظ كلمة المرور وتسجيل الخروج
            </button>
          </form>
        </>
      )}
    </div>
  );
}
