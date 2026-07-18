"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useLang } from "@/components/LangProvider";

/** Read-only value with a copy-to-clipboard button. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (http / old browser) — user can select manually
    }
  }

  return (
    <div>
      {label && <label className="block text-xs text-neutral-500 mb-1">{label}</label>}
      <div className="flex gap-2">
        <input className="input flex-1 text-sm" dir="ltr" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" onClick={copy} className="btn-secondary shrink-0" title={t.dash.referrals.copy}>
          {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
          {copied ? t.dash.referrals.copied : t.dash.referrals.copy}
        </button>
      </div>
    </div>
  );
}
