"use client";

import { clientFetch } from "@/lib/client-fetch";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useLang } from "@/components/LangProvider";

/** Confirm with a password or an email OTP for an OAuth-only account. */
export function DeleteAccountCard({ oauthOnly = false }: { oauthOnly?: boolean }) {
  const { t, lang } = useLang();
  const d = t.dash.settings;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await clientFetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        oauthOnly ? { challenge: challenge || undefined, code: code || undefined } : { password },
      ),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? d.genericError);
      setLoading(false);
      return;
    }
    if (data.requiresOtp) {
      setChallenge(data.challenge);
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="card p-5 border-red-100 space-y-3">
      <div className="flex items-center gap-2 text-red-600">
        <AlertTriangle className="size-5" />
        <h2 className="font-bold text-neutral-900">{d.delTitle}</h2>
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed">
        {d.delBody} <b>{d.delNoUndo}</b>
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn bg-white border border-red-200 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="size-4" />
          {d.delWant}
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3 max-w-sm">
          {oauthOnly ? (
            <div className="rounded-xl bg-amber-50 p-3 text-sm">
              <p>
                {lang === "ar"
                  ? "أكّد حذف حسابك برمز تحقق يُرسل إلى بريدك الحالي."
                  : "Confirm account deletion with a code sent to your current email."}
              </p>
              {challenge && (
                <label className="block mt-2">
                  {lang === "ar" ? "رمز التحقق" : "Verification code"}
                  <input
                    className="input mt-1"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1.5">{d.delConfirmPw}</label>
              <input
                className="input"
                dir="ltr"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              className="btn bg-red-600 text-white hover:bg-red-700"
              disabled={
                loading ||
                (!oauthOnly && !password) ||
                (oauthOnly && !!challenge && code.length !== 6)
              }
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {oauthOnly && !challenge
                ? lang === "ar"
                  ? "إرسال رمز التحقق"
                  : "Send verification code"
                : d.delFinal}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              {d.delBack}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
