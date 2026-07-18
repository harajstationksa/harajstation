"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/components/LangProvider";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

/**
 * Listing image gallery. The fullscreen lightbox supports zoom (buttons,
 * mouse wheel, double-click), drag-to-pan while zoomed, swipe / arrow-key
 * navigation, and a thumbnail strip. The inline image supports touch swipe.
 */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const { t } = useLang();
  const list = images.length > 0 ? images : ["/images/ph/chair1.svg"];
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  // ── lightbox zoom & pan state ──
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; baseX: number; baseY: number } | null>(null);
  // inline (page) image swipe tracking
  const swipe = useRef<{ x: number; fired: boolean }>({ x: 0, fired: false });

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const goTo = useCallback(
    (i: number) => {
      setActive(i);
      resetView();
    },
    [resetView]
  );
  const next = useCallback(
    () => goTo((active + 1) % list.length),
    [goTo, active, list.length]
  );
  const prev = useCallback(
    () => goTo((active - 1 + list.length) % list.length),
    [goTo, active, list.length]
  );

  /** Clamp the pan offset so the image never drifts fully off-stage. */
  const clampOffset = useCallback((x: number, y: number, scale: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const maxX = ((rect?.width ?? 800) / 2) * (scale - 1);
    const maxY = ((rect?.height ?? 600) / 2) * (scale - 1);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }, []);

  const zoomBy = useCallback(
    (delta: number) => {
      setZoom((z) => {
        const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 10) / 10));
        if (nz === 1) setOffset({ x: 0, y: 0 });
        else setOffset((o) => clampOffset(o.x, o.y, nz));
        return nz;
      });
    },
    [clampOffset]
  );

  // lightbox keyboard controls: Escape closes, arrows flip (RTL-aware), +/- zoom
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") next();
      if (e.key === "ArrowRight") prev();
      if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
      if (e.key === "-") zoomBy(-ZOOM_STEP);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, next, prev, zoomBy]);

  // ── lightbox pointer handling: pan while zoomed, swipe-to-flip otherwise ──
  function onStagePointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, baseX: offset.x, baseY: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (zoom > 1) setDragging(true);
  }
  function onStagePointerMove(e: React.PointerEvent) {
    if (!drag.current || zoom <= 1) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setOffset(clampOffset(drag.current.baseX + dx, drag.current.baseY + dy, zoom));
  }
  function onStagePointerUp(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    const stillTap = Math.abs(dx) < 6 && Math.abs(dy) < 6;
    if (zoom === 1 && list.length > 1 && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      // not zoomed: a mostly-horizontal swipe flips the image
      if (dx < 0) next();
      else prev();
    } else if (stillTap && e.target === stageRef.current) {
      // tap on the empty backdrop (not the image) closes the lightbox
      setOpen(false);
    }
    drag.current = null;
    setDragging(false);
  }

  return (
    <div className="space-y-2">
      <div className="card overflow-hidden relative group">
        <button
          type="button"
          onClick={() => {
            if (swipe.current.fired) {
              swipe.current.fired = false;
              return; // touch swipe, not a tap
            }
            resetView();
            setOpen(true);
          }}
          onTouchStart={(e) => {
            swipe.current = { x: e.touches[0].clientX, fired: false };
          }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - swipe.current.x;
            if (list.length > 1 && Math.abs(dx) > 48) {
              swipe.current.fired = true;
              if (dx < 0) next();
              else prev();
            }
          }}
          className="block w-full cursor-zoom-in touch-pan-y"
          aria-label={t.pub.gOpen}
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
              onClick={() => goTo(i)}
              className={cn(
                "w-20 aspect-4/3 rounded-lg overflow-hidden border-2 shrink-0 transition-colors cursor-pointer",
                i === active ? "border-primary-500" : "border-transparent hover:border-neutral-300"
              )}
              aria-label={t.pub.gImageN(i + 1)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ── fullscreen lightbox ──
          portaled to <body>: the page's sticky columns create their own
          stacking contexts that would otherwise paint above the overlay */}
      {open && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
          {/* top bar: close + zoom controls + counter */}
          <div className="flex items-center justify-between gap-3 p-3 sm:p-4 text-white shrink-0">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="size-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
              aria-label={t.pub.gClose}
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-1.5 rounded-full bg-white/10 p-1">
              <button
                type="button"
                onClick={() => zoomBy(-ZOOM_STEP)}
                disabled={zoom <= MIN_ZOOM}
                className="size-8 rounded-full hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center transition-colors cursor-pointer disabled:cursor-default"
                aria-label={t.pub.gZoomOut}
              >
                <Minus className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => (zoom > 1 ? resetView() : zoomBy(1.5))}
                className="min-w-14 text-center text-xs font-semibold tabular-nums cursor-pointer select-none"
                title={zoom > 1 ? t.pub.gResetZoom : t.pub.gZoomIn}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => zoomBy(ZOOM_STEP)}
                disabled={zoom >= MAX_ZOOM}
                className="size-8 rounded-full hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center transition-colors cursor-pointer disabled:cursor-default"
                aria-label={t.pub.gZoomIn}
              >
                <Plus className="size-4" />
              </button>
            </div>

            {list.length > 1 ? (
              <span className="text-sm tabular-nums text-white/80 min-w-12 text-left">
                {active + 1} / {list.length}
              </span>
            ) : (
              <span className="min-w-12" />
            )}
          </div>

          {/* stage: wheel zoom, drag to pan, double-click toggle, swipe to flip */}
          <div
            ref={stageRef}
            className="flex-1 flex items-center justify-center min-h-0 overflow-hidden px-2 sm:px-16 relative touch-none select-none"
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            onWheel={(e) => zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)}
            onDoubleClick={() => (zoom > 1 ? resetView() : zoomBy(1.5))}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={list[active]}
              alt={title}
              draggable={false}
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
              className={cn(
                "max-h-full max-w-full object-contain rounded-lg",
                !dragging && "transition-transform duration-150",
                zoom > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
              )}
            />
            {list.length > 1 && (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={next}
                  className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 size-10 sm:size-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label={t.pub.gNext}
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={prev}
                  className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 size-10 sm:size-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label={t.pub.gPrev}
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>

          {/* thumbnail strip */}
          {list.length > 1 && (
            <div className="flex gap-2 justify-center p-3 sm:p-4 overflow-x-auto no-scrollbar shrink-0">
              {list.map((src, i) => (
                <button
                  key={src + i}
                  onClick={() => goTo(i)}
                  className={cn(
                    "w-14 sm:w-16 aspect-4/3 rounded-md overflow-hidden border-2 shrink-0 transition-all cursor-pointer",
                    i === active
                      ? "border-primary-500 opacity-100"
                      : "border-transparent opacity-50 hover:opacity-80"
                  )}
                  aria-label={t.pub.gImageN(i + 1)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
