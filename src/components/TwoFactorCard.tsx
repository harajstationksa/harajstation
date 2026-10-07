"use client";

import { clientFetch } from "@/lib/client-fetch";

import { useState } from "react";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useLang } from "@/components/LangProvider";

/**
 * Opt-in email 2FA: when on, every login mails a 6-digit one-time code to the
 * account address and the password alone no longer opens a session.
 */
export function TwoFactorCard({
  email,
  initialEnabled,
  requiresPassword = true,
}: {
  email: string;
  initialEnabled: boolean;
  requiresPassword?: boolean;
}) {
  const { t, lang } = useLang();
  const d = t.dash.settings;
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");

  async function toggle() {
    if (loading) return;
    setLoading(true);
    setError("");
    const res = await clientFetch("/api/account/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: !enabled,
        currentPassword: password,
        ...(challenge ? { challenge, code } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? d.genericError);
      return;
    }
    if (data.requiresOtp) {
      setChallenge(data.challenge);
      return;
    }
    setEnabled(data.enabled);
    setChallenge("");
    setCode("");
    setPassword("");
  }

  return (
    <div className="card p-5 space-y-3 max-w-xl">
      <div className="flex items-center gap-2 text-primary-600">
        <ShieldCheck className="size-5" />
        <h2 className="font-bold text-neutral-900">{d.tfaTitle}</h2>
        {enabled && (
          <span className="badge bg-green-50 text-green-700 border border-green-100">
            {d.tfaOn}
          </span>
        )}
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed">{d.tfaBody(email)}</p>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {requiresPassword && (
        <label className="block text-sm">
          {d.currentPassword}
          <input
            className="input mt-1"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!!challenge || loading}
          />
        </label>
      )}
      {challenge && (
        <label className="block text-sm">
          {lang === "en"
            ? "Enter the six-digit code sent to your email"
            : "أدخل الرمز المكون من 6 أرقام المرسل إلى بريدك"}
          <input
            className="input mt-1"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button
            type="button"
            className="btn-ghost mt-2"
            onClick={() => {
              setChallenge("");
              setCode("");
            }}
            disabled={loading}
          >
            {d.cancel}
          </button>
        </label>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={loading || (requiresPassword && !password) || (!!challenge && code.length !== 6)}
        className={enabled ? "act-btn bg-red-50 text-red-600 hover:bg-red-100" : "btn-secondary"}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : enabled ? (
          <ShieldOff className="size-4" />
        ) : (
          <ShieldCheck className="size-4" />
        )}
        {challenge
          ? lang === "en"
            ? "Confirm change"
            : "تأكيد التغيير"
          : enabled
            ? d.tfaDisable
            : d.tfaEnable}
      </button>
    </div>
  );
}
