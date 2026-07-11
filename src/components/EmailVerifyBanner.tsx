"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";

/** Amber dashboard banner shown while the registration email is unconfirmed. */
export function EmailVerifyBanner() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function resend() {
    setState("sending");
    setError("");
    const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "تعذّر الإرسال — حاول لاحقاً");
      setState("error");
      return;
    }
    setState("sent");
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6 flex items-center gap-3 flex-wrap">
      <MailWarning className="size-5 text-amber-600 shrink-0" />
      <p className="text-sm text-amber-900 flex-1 min-w-48">
        بريدك الإلكتروني غير مؤكد — افتح رسالة التأكيد في بريدك واضغط الرابط.
      </p>
      {state === "sent" ? (
        <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
          <CheckCircle2 className="size-4" />
          أُرسلت رسالة جديدة
        </span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={state === "sending"}
          className="badge bg-amber-600 text-white cursor-pointer hover:bg-amber-700"
        >
          {state === "sending" && <Loader2 className="size-3.5 animate-spin" />}
          إعادة إرسال الرابط
        </button>
      )}
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
