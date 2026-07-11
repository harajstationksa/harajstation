"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Gallery({ images, title }: { images: string[]; title: string }) {
  const list = images.length > 0 ? images : ["/images/ph/chair1.svg"];
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const next = useCallback(() => setActive((i) => (i + 1) % list.length), [list.length]);
  const prev = useCallback(
    () => setActive((i) => (i - 1 + list.length) % list.length),
    [list.length]
  );

  // lightbox keyboard controls: Escape closes, arrows flip (RTL-aware)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") next();
      if (e.key === "ArrowRight") prev();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, next, prev]);

  return (
    <div className="space-y-2">
      <div className="card overflow-hidden relative group">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full cursor-zoom-in"
          aria-label="تكبير الصورة"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={list[active]}
            alt={title}
            className="w-full aspect-4/3 object-cover"
          />
        </button>
        <span className="absolute bottom-3 left-3 size-9 rounded-full bg-black/45 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Maximize2 className="size-4" />
        </span>
        {list.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-md bg-black/45 text-white text-xs font-semibold px-2 py-1 tabular-nums pointer-events-none">
            {active + 1} / {list.length}
          </span>
        )}
      </div>

      {list.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {list.map((src, i) => (
            <button
              key={src + i}
              onClick={() => setActive(i)}
              className={cn(
                "w-20 aspect-4/3 rounded-lg overflow-hidden border-2 shrink-0 transition-colors cursor-pointer",
                i === active ? "border-primary-500" : "border-transparent hover:border-neutral-300"
              )}
              aria-label={`صورة ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ── fullscreen lightbox ── */}
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
          onClick={() => setOpen(false)}
        >
          {/* top bar */}
          <div className="flex items-center justify-between p-4 text-white shrink-0">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="size-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="size-5" />
            </button>
            {list.length > 1 && (
              <span className="text-sm tabular-nums text-white/80">
                {active + 1} / {list.length}
              </span>
            )}
          </div>

          {/* stage */}
          <div className="flex-1 flex items-center justify-center min-h-0 px-4 sm:px-16 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={list[active]}
              alt={title}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full object-contain rounded-lg select-none"
            />
            {list.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    next();
                  }}
                  className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="الصورة التالية"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    prev();
                  }}
                  className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="الصورة السابقة"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>

          {/* thumbnail strip */}
          {list.length > 1 && (
            <div
              className="flex gap-2 justify-center p-4 overflow-x-auto no-scrollbar shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {list.map((src, i) => (
                <button
                  key={src + i}
                  onClick={() => setActive(i)}
                  className={cn(
                    "w-16 aspect-4/3 rounded-md overflow-hidden border-2 shrink-0 transition-all cursor-pointer",
                    i === active
                      ? "border-primary-500 opacity-100"
                      : "border-transparent opacity-50 hover:opacity-80"
                  )}
                  aria-label={`صورة ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
