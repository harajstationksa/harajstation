"use client";

import { useState } from "react";
import { Check, Link2, MessageCircle, QrCode, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * أزرار المشاركة — WhatsApp / نسخ الرابط / QR / مشاركة النظام. The QR image
 * is generated server-side (SharePanel) and passed in as a data URL.
 * Mobile: 2×2 grid; desktop: single row.
 */
export function ShareButtons({
  url,
  title,
  qrDataUrl,
}: {
  url: string;
  title: string;
  qrDataUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard API blocked (http) — fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      /* user dismissed */
    }
  }

  const text = encodeURIComponent(`${title}\n${url}`);

  const itemCls =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-[13px] font-semibold transition-colors";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <a
          href={`https://wa.me/?text=${text}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(itemCls, "border-green-200 bg-green-50 text-green-700 hover:bg-green-100")}
        >
          <MessageCircle className="size-4 shrink-0" />
          واتساب
        </a>
        <button
          type="button"
          onClick={copy}
          className={cn(
            itemCls,
            copied
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
          )}
        >
          {copied ? <Check className="size-4 shrink-0" /> : <Link2 className="size-4 shrink-0" />}
          {copied ? "نُسخ!" : "نسخ الرابط"}
        </button>
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className={cn(
            itemCls,
            showQr
              ? "border-primary-300 bg-primary-50 text-primary-700"
              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
          )}
          aria-expanded={showQr}
        >
          <QrCode className="size-4 shrink-0" />
          رمز QR
        </button>
        {/* system share sheet — mobile only (desktop rarely supports it) */}
        <button
          type="button"
          onClick={nativeShare}
          className={cn(
            itemCls,
            "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 sm:hidden"
          )}
        >
          <Share2 className="size-4 shrink-0" />
          مشاركة
        </button>
      </div>

      {showQr && (
        <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-4 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR للإعلان" className="size-40 rounded-lg border border-neutral-200 bg-white p-2" />
          <p className="text-[11px] text-neutral-400 text-center">
            امسح الرمز بكاميرا الجوال لفتح الإعلان مباشرة
          </p>
        </div>
      )}
    </div>
  );
}
