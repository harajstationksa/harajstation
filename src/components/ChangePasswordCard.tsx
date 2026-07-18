"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Send } from "lucide-react";
import { useLang } from "@/components/LangProvider";

/**
 * Password change via the existing reset flow: a single-use, 30-minute link is
 * emailed to the account address (no old-password prompt here — the inbox is
 * the proof of ownership, same as forgot-password). Without SMTP (local dev)
 * the API hands back the link and we show it inline.
 */
export function ChangePasswordCard({ email }: { email: string }) {
  const { t } = useLang();
  const d = t.dash.settings;
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestLink() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? d.genericError);
      return;
    }
    setSent(true);
    if (data.resetUrl) setDevUrl(data.resetUrl);
  }

  return (
    <div className="card p-5 space-y-3 max-w-xl">
      <div className="flex items-center gap-2 text-primary-600">
        <KeyRound className="size-5" />
        <h2 className="font-bold text-neutral-900">{d.pwTitle}</h2>
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed">{d.pwBody(email)}</p>

      {sent ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
            <CheckCircle2 className="size-4 shrink-0" />
            {d.pwSent}
          </p>
          {devUrl && (
            <p className="text-xs text-neutral-500 bg-neutral-50 border border-neutral-100 rounded-lg px-3 py-2">
              {d.pwDev}{" "}
              <a href={devUrl} className="text-primary-600 font-semibold hover:underline" dir="ltr">
                {devUrl}
              </a>
            </p>
          )}
        </div>
      ) : (
        <>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={requestLink}
            disabled={loading}
            className="btn-secondary"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {d.pwBtn}
          </button>
        </>
      )}
    </div>
  );
}
