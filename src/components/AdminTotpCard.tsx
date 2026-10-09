"use client";
import { useState } from "react";
import { ShieldCheck, Smartphone } from "lucide-react";
import {
  startTotpEnrollmentAction,
  confirmTotpEnrollmentAction,
  disableTotpAction,
} from "@/app/admin/account/actions";
import type { AdminResult } from "@/lib/admin";

/** Enroll, confirm or remove the authenticator-app second factor. */
export function AdminTotpCard({ enabled }: { enabled: boolean }) {
  const [active, setActive] = useState(enabled);
  const [enrollment, setEnrollment] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<AdminResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<AdminResult & { secret?: string; qr?: string }>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action();
      setMessage(result);
      return result;
    } catch {
      setMessage({ ok: false, message: "تعذّر الاتصال؛ حاول مجددًا" });
    } finally {
      setBusy(false);
    }
  }

  const form = (fd: (data: FormData) => Promise<AdminResult>) => {
    const data = new FormData();
    data.set("totp", code);
    return () => fd(data);
  };

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Smartphone className="size-6 text-primary-500 shrink-0" />
        <div>
          <h2 className="font-bold">تطبيق المصادقة (حماية ثانية)</h2>
          <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
            {active
              ? "مفعّل: يُطلب رمز التطبيق مع رمز البريد في كل دخول، فلا يكفي اختراق البريد وحده للدخول."
              : "غير مفعّل: الدخول يعتمد على بريدك فقط. فعّله بتطبيق مثل Google Authenticator أو Microsoft Authenticator."}
          </p>
        </div>
      </div>

      {!active && !enrollment && (
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            const r = await run(startTotpEnrollmentAction);
            if (r?.ok && r.secret && r.qr) setEnrollment({ secret: r.secret, qr: r.qr });
          }}
        >
          <ShieldCheck className="size-4" />
          تفعيل تطبيق المصادقة
        </button>
      )}

      {!active && enrollment && (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrollment.qr}
            alt="رمز QR لإضافة الحساب إلى تطبيق المصادقة"
            className="size-[220px] rounded-lg border border-neutral-200 bg-white"
          />
          <p className="text-xs text-neutral-500">
            أو أدخل المفتاح يدويًا:{" "}
            <code dir="ltr" className="font-mono break-all">
              {enrollment.secret}
            </code>
          </p>
        </div>
      )}

      {(active || enrollment) && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="admin-totp-code" className="block text-sm font-medium mb-1.5">
              الرمز من التطبيق
            </label>
            <input
              id="admin-totp-code"
              className="input w-40 text-center tracking-[0.3em]"
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          {active ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy || code.length !== 6}
              onClick={async () => {
                const r = await run(form(disableTotpAction));
                if (r?.ok) {
                  setActive(false);
                  setCode("");
                }
              }}
            >
              تعطيل
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || code.length !== 6}
              onClick={async () => {
                const r = await run(form(confirmTotpEnrollmentAction));
                if (r?.ok) {
                  setActive(true);
                  setEnrollment(null);
                  setCode("");
                }
              }}
            >
              تأكيد التفعيل
            </button>
          )}
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`} role="status">
          {message.message}
        </p>
      )}
    </section>
  );
}
