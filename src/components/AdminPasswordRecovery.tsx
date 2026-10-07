"use client";

import { clientFetch } from "@/lib/client-fetch";
import { useState } from "react";
export function AdminPasswordRecovery({ email }: { email: string }) {
  const [open, setOpen] = useState(false),
    [challenge, setChallenge] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  async function submit(data: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const resetting = !!challenge;
      const password = String(data.get("password") ?? "");
      if (resetting && password !== data.get("confirm")) {
        setMessage("كلمتا المرور غير متطابقتين");
        return;
      }
      const res = await clientFetch(
        resetting ? "/api/admin-auth/reset" : "/api/admin-auth/forgot",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            resetting
              ? { challenge, code: data.get("code"), password }
              : { email: data.get("email") },
          ),
          signal: AbortSignal.timeout(20000),
        },
      );
      const result = await res.json();
      if (!res.ok) {
        setMessage(result.error ?? "تعذّر إكمال الطلب");
        return;
      }
      if (resetting) {
        setChallenge("");
        setDone(true);
        setMessage(
          "تم تغيير كلمة المرور وإلغاء الجلسات والرموز السابقة. ارجع وسجل الدخول من جديد.",
        );
      } else {
        setChallenge(result.challenge);
        setMessage("إذا كان البريد لحساب موظف نشط وصالح للإرسال، سيصل إليه رمز الاستعادة.");
      }
    } catch {
      setMessage("تعذّر الاتصال. حاول مجددًا");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 text-sm">
      <button type="button" className="text-primary-600" onClick={() => setOpen(!open)}>
        نسيت كلمة المرور؟
      </button>
      {open && (
        <form action={submit} className="space-y-3">
          <fieldset disabled={busy} className="space-y-3 w-full">
            {!challenge && !done && (
              <>
                <label className="block text-neutral-600">
                  بريد الموظف
                  <input
                    name="email"
                    type="email"
                    className="input"
                    defaultValue={email}
                    required
                  />
                </label>
                <button className="btn-secondary w-full">طلب رمز الاستعادة</button>
              </>
            )}
            {challenge && (
              <>
                <label className="block text-neutral-600">
                  رمز البريد
                  <input
                    name="code"
                    className="input"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoComplete="one-time-code"
                  />
                </label>
                <label className="block text-neutral-600">
                  كلمة المرور الجديدة
                  <input
                    name="password"
                    type="password"
                    className="input"
                    minLength={10}
                    maxLength={72}
                    required
                    autoComplete="new-password"
                  />
                </label>
                <label className="block text-neutral-600">
                  تأكيدها
                  <input
                    name="confirm"
                    type="password"
                    className="input"
                    minLength={10}
                    required
                    autoComplete="new-password"
                  />
                </label>
                <button className="btn-primary w-full">حفظ كلمة المرور</button>
                <button type="button" className="text-primary-600" onClick={() => setChallenge("")}>
                  طلب رمز آخر
                </button>
              </>
            )}
          </fieldset>
          {busy && <p role="status">جارٍ التنفيذ…</p>}
          {message && (
            <p role="status" className="text-neutral-600">
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
