"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useLang } from "./LangProvider";

/** Compact frosted countdown that sits on an auction photo (phone layout). */
export function GlassTimer({ endsAt, className }: { endsAt: string | Date; className?: string }) {
  const { lang } = useLang();
  const target = new Date(endsAt).getTime();
  const [left, setLeft] = useState(() => target - Date.now());
  useEffect(() => {
    const id = setInterval(() => setLeft(target - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const s = Math.max(0, Math.floor(left / 1000));
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  const u = lang === "ar" ? { d: "ي", h: "س", m: "د" } : { d: "d", h: "h", m: "m" };
  const text =
    s === 0
      ? lang === "ar"
        ? "انتهى"
        : "Ended"
      : d > 0
        ? `${d}${u.d} ${h}${u.h}`
        : h > 0
          ? `${h}${u.h} ${m}${u.m}`
          : `${two(m)}:${two(sec)}`;
  const urgent = s > 0 && s < 600;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-[11.5px] font-bold tabular-nums text-white",
        "backdrop-blur-md backdrop-saturate-150 shadow-[inset_0_1px_0_rgb(255_255_255/40%)]",
        urgent ? "border-red-200/60 bg-red-600/60 animate-pulse" : "border-white/35 bg-white/20",
        className,
      )}
      // digits-only clock reads left-to-right; "3h 16m" style follows the page
      dir={d === 0 && h === 0 ? "ltr" : undefined}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        aria-hidden
      >
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 1.5M9.5 2.5h5" strokeLinecap="round" />
      </svg>
      {text}
    </span>
  );
}
