"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, X } from "lucide-react";

/** Banners render at 4:1 on desktop (BannerCarousel), cropped tighter on phones. */
const RATIO = 4;
const RECOMMENDED = "1600 × 400";
const TOLERANCE = 0.4;

/**
 * Upload a banner image, or paste a URL — either way the resulting URL lands in
 * a hidden field, so the existing server action keeps taking `imageUrl`.
 *
 * The preview is a 4:1 frame: what the admin sees is the crop the visitor gets.
 * Once an image loads we show its real pixel size and say plainly whether the
 * proportions fit, because a banner at the wrong ratio isn't rejected — it is
 * silently cut, and that is only discovered on the live homepage.
 */
export function BannerImageField() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch("/api/admin/banner-image", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "تعذّر رفع الصورة");
      return;
    }
    setDims(null);
    setUrl(data.url);
  }

  function clear() {
    setUrl("");
    setDims(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const ratio = dims ? dims.w / dims.h : null;
  const fits = ratio !== null && Math.abs(ratio - RATIO) <= TOLERANCE;

  return (
    <div className="sm:col-span-2 space-y-2">
      <label className="block text-sm font-medium">صورة البانر</label>

      {/* the URL the action reads — editable, so an existing path still works */}
      <div className="flex gap-2">
        <input
          name="imageUrl"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setDims(null);
          }}
          className="input flex-1"
          dir="ltr"
          placeholder="ارفع صورة أو الصق رابطاً — /images/showcase/cars.svg"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="btn-secondary shrink-0"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
          {busy ? "جارٍ الرفع…" : "رفع صورة"}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {url && (
        <div className="relative">
          {/* the exact frame the banner gets on the homepage */}
          <div className="relative aspect-4/1 w-full overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="معاينة البانر"
              className="size-full object-cover"
              onLoad={(e) =>
                setDims({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
              onError={() => {
                setDims(null);
                setError("تعذّر تحميل الصورة من هذا الرابط");
              }}
            />
          </div>
          <button
            type="button"
            onClick={clear}
            className="absolute top-2 left-2 size-7 rounded-full bg-neutral-900/70 text-white flex items-center justify-center hover:bg-neutral-900 transition-colors"
            aria-label="إزالة الصورة"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {dims && (
        <p
          className={`text-xs font-medium ${fits ? "text-emerald-700" : "text-amber-700"}`}
          dir="rtl"
        >
          مقاس الصورة:{" "}
          <span dir="ltr" className="font-mono">
            {dims.w} × {dims.h}
          </span>{" "}
          — نسبة{" "}
          <span dir="ltr" className="font-mono">
            {ratio!.toFixed(1)}:1
          </span>
          {fits ? " ✓ مناسبة" : ` — المطلوب 4:1، فسيُقتطع جزء من الصورة`}
        </p>
      )}

      <p className="text-xs text-neutral-500 leading-relaxed">
        المقاس المقترح{" "}
        <span dir="ltr" className="font-mono text-neutral-700">
          {RECOMMENDED}
        </span>{" "}
        بكسل (نسبة 4:1) — بحد أقصى 5MB، بصيغة JPG أو PNG أو WebP.
        <br />
        على الهاتف تُقتطع الأطراف، فاجعل المحتوى المهم في منتصف الصورة.
      </p>
    </div>
  );
}
