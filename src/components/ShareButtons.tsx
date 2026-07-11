"use client";

import { useState } from "react";
import { Check, Link2, MessageCircle, QrCode, Share2, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * أزرار المشاركة — WhatsApp / X / نسخ الرابط / QR. The QR image is generated
 * server-side (SharePanel) and passed in as a data URL.
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
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const itemCls =
    "flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors";

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <a
          href={`https://wa.me/?text=${text}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(itemCls, "border-green-200 bg-green-50 text-green-700 hover:bg-green-100")}
        >
          <MessageCircle className="size-4 shrink-0" />
          واتساب
        </a>
        <a
          href={`https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(itemCls, "border-neutral-200 bg-neutral-900 text-white hover:bg-neutral-700")}
        >
          <XIcon className="size-4 shrink-0" />
          X
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
          QR
        </button>
        {canNativeShare && (
          <button
            type="button"
            onClick={nativeShare}
            className={cn(itemCls, "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 sm:hidden")}
            aria-label="مشاركة"
          >
            <Share2 className="size-4 shrink-0" />
          </button>
        )}
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
