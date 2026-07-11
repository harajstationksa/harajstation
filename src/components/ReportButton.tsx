"use client";

import { useState } from "react";
import { Check, Flag, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "./LangProvider";

const R = {
  ar: {
    report: "إبلاغ",
    reported: "تم الإبلاغ",
    reason: "سبب البلاغ",
    placeholder: "صف المخالفة باختصار...",
    submit: "إرسال البلاغ",
    failed: "تعذّر إرسال البلاغ",
  },
  en: {
    report: "Report",
    reported: "Reported",
    reason: "Report reason",
    placeholder: "Briefly describe the violation...",
    submit: "Submit report",
    failed: "Failed to submit report",
  },
};

export function ReportButton({
  targetType,
  targetId,
  compact = false,
  className,
}: {
  targetType: "LISTING" | "USER" | "COMMENT" | "MESSAGE";
  targetId: string;
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const { lang } = useLang();
  const r = R[lang];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, reason }),
    });
    if (res.ok) {
      setState("done");
      setOpen(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? r.failed);
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-green-700", className)}>
        <Check className="size-3.5" />
        {r.reported}
      </span>
    );
  }

  return (
    <span className={cn("relative inline-block", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 text-neutral-400 hover:text-red-600 transition-colors cursor-pointer",
          compact ? "text-xs" : "text-sm"
        )}
        aria-label={r.report}
      >
        <Flag className={compact ? "size-3.5" : "size-4"} />
        {!compact && r.report}
      </button>

      {open && (
        <form
          onSubmit={submit}
          className="absolute z-30 top-full mt-1 left-0 w-64 card p-3 space-y-2 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold">{r.reason}</p>
            <button type="button" onClick={() => setOpen(false)} className="text-neutral-400 cursor-pointer">
              <X className="size-3.5" />
            </button>
          </div>
          <textarea
            className="input min-h-16 py-2 text-xs"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={r.placeholder}
            minLength={5}
            required
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button className="btn-danger w-full min-h-8 text-xs" disabled={state === "sending"}>
            {state === "sending" && <Loader2 className="size-3 animate-spin" />}
            {r.submit}
          </button>
        </form>
      )}
    </span>
  );
}
