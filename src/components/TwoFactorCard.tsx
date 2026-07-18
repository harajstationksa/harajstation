"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";

/**
 * Opt-in email 2FA: when on, every login mails a 6-digit one-time code to the
 * account address and the password alone no longer opens a session.
 */
export function TwoFactorCard({
  email,
  initialEnabled,
}: {
  email: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/account/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "حدث خطأ — حاول مجدداً");
      return;
    }
    setEnabled(data.enabled);
  }

  return (
    <div className="card p-5 space-y-3 max-w-xl">
      <div className="flex items-center gap-2 text-primary-600">
        <ShieldCheck className="size-5" />
        <h2 className="font-bold text-neutral-900">التحقق بخطوتين (2FA)</h2>
        {enabled && (
          <span className="badge bg-green-50 text-green-700 border border-green-100">مفعّل</span>
        )}
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed">
        طبقة حماية إضافية: عند كل تسجيل دخول نرسل رمزاً مكوّناً من 6 أرقام إلى بريدك{" "}
        <b dir="ltr">{email}</b> — حتى لو عرف أحد كلمة مرورك، ما يقدر يدخل بدون الرمز.
      </p>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className={enabled ? "act-btn bg-red-50 text-red-600 hover:bg-red-100" : "btn-secondary"}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : enabled ? (
          <ShieldOff className="size-4" />
        ) : (
          <ShieldCheck className="size-4" />
        )}
        {enabled ? "تعطيل التحقق بخطوتين" : "تفعيل التحقق بخطوتين"}
      </button>
    </div>
  );
}
