"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X, ZoomIn } from "lucide-react";

/**
 * Circle-crop editor: drag to reposition, slider to zoom.
 * Exports a 512×512 JPEG matching exactly what the preview circle shows.
 */
export function AvatarCropper({
  file,
  onCancel,
  onSave,
  labels,
}: {
  file: File;
  onCancel: () => void;
  onSave: (cropped: File) => void;
  labels: { title: string; save: string; cancel: string; hint: string };
}) {
  const VIEW = 260; // on-screen crop circle size
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!img) return null;

  // scale that makes the image exactly cover the circle at zoom=1
  const baseScale = VIEW / Math.min(img.width, img.height);
  const scale = baseScale * zoom;
  const drawW = img.width * scale;
  const drawH = img.height * scale;

  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min((drawW - VIEW) / 2, Math.max(-(drawW - VIEW) / 2, o.x)),
    y: Math.min((drawH - VIEW) / 2, Math.max(-(drawH - VIEW) / 2, o.y)),
  });
  const pos = clamp(offset);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setOffset(
      clamp({
        x: drag.current.ox + (e.clientX - drag.current.startX),
        y: drag.current.oy + (e.clientY - drag.current.startY),
      })
    );
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function save() {
    const OUT = 512;
    const k = OUT / VIEW; // preview → output scale
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUT;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      img!,
      ((VIEW - drawW) / 2 + pos.x) * k,
      ((VIEW - drawH) / 2 + pos.y) * k,
      drawW * k,
      drawH * k
    );
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    if (blob) onSave(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="close" onClick={onCancel} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative card p-5 w-full max-w-sm space-y-4 animate-fade-up">
        <p className="font-bold text-center">{labels.title}</p>

        <div
          className="relative mx-auto overflow-hidden rounded-full border-4 border-white shadow-lg cursor-grab active:cursor-grabbing touch-none select-none bg-neutral-100"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.src}
            alt=""
            draggable={false}
            className="absolute max-w-none pointer-events-none"
            style={{
              width: drawW,
              height: drawH,
              left: (VIEW - drawW) / 2 + pos.x,
              top: (VIEW - drawH) / 2 + pos.y,
            }}
          />
        </div>

        <p className="text-xs text-neutral-400 text-center">{labels.hint}</p>

        <div className="flex items-center gap-3 px-2" dir="ltr">
          <ZoomIn className="size-4 text-neutral-400 shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-primary-500"
            aria-label="zoom"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={save} className="btn-primary flex-1">
            <Check className="size-4" />
            {labels.save}
          </button>
          <button onClick={onCancel} className="btn-secondary px-4">
            <X className="size-4" />
            {labels.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
