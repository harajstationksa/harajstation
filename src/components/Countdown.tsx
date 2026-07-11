"use client";

import { useEffect, useState } from "react";
import { cn, timeParts, two } from "@/lib/utils";
import { useLang } from "./LangProvider";

const UNITS = {
  ar: { d: "يوم", h: "ساعة", m: "دقيقة", s: "ثانية", ended: "انتهى" },
  en: { d: "Days", h: "Hrs", m: "Min", s: "Sec", ended: "Ended" },
};

export function Countdown({
  endsAt,
  size = "sm",
  onEnd,
}: {
  endsAt: string | Date;
  size?: "sm" | "lg";
  onEnd?: () => void;
}) {
  const target = typeof endsAt === "string" ? new Date(endsAt).getTime() : endsAt.getTime();
  const [msLeft, setMsLeft] = useState(() => target - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const left = target - Date.now();
      setMsLeft(left);
      if (left <= 0) {
        clearInterval(id);
        onEnd?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, onEnd]);

  const { lang } = useLang();
  const u = UNITS[lang];
  const { days, hours, minutes, seconds } = timeParts(msLeft);
  const urgent = msLeft < 60 * 60 * 1000; // < 1h
  const ended = msLeft <= 0;

  if (size === "lg") {
    const cells: [number, string][] = [
      [days, u.d],
      [hours, u.h],
      [minutes, u.m],
      [seconds, u.s],
    ];
    return (
      <div dir="ltr" className="flex items-center justify-center gap-2">
        {cells.map(([value, label], i) => (
          <div
            key={label}
            className={cn(
              "flex flex-col items-center rounded-lg px-3 py-2 min-w-16 tabular-nums",
              ended
                ? "bg-neutral-100 text-neutral-400"
                : urgent && i >= 2
                  ? "bg-red-50 text-red-700"
                  : "bg-neutral-900 text-white"
            )}
          >
            <span suppressHydrationWarning className="text-2xl font-bold font-display">
              {two(value)}
            </span>
            <span className="text-[11px] opacity-70">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <span
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1 tabular-nums font-semibold text-sm",
        ended ? "text-neutral-400" : urgent ? "text-red-600" : "text-neutral-700"
      )}
    >
      {ended ? (
        u.ended
      ) : (
        <>
          {days > 0 && <span suppressHydrationWarning>{days} {u.d}</span>}
          <span dir="ltr" suppressHydrationWarning>
            {`${two(hours)}:${two(minutes)}:${two(seconds)}`}
          </span>
        </>
      )}
    </span>
  );
}
