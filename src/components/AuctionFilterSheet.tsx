"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "./LangProvider";

type Option = { value: string; label: string };

const noopSubscribe = () => () => {};

/**
 * Phone-only bottom sheet with the auction search, city and sort controls —
 * replaces the four-field toolbar on small screens. Submits a plain GET form,
 * so it works without JavaScript state on the server side.
 */
export function AuctionFilterSheet({
  q,
  city,
  sort,
  category,
  quick,
  cities,
  sorts,
  activeCount,
}: {
  q?: string;
  city?: string;
  sort: string;
  category?: string;
  quick?: string;
  cities: string[];
  sorts: Option[];
  activeCount: number;
}) {
  const { t } = useLang();
  const a = t.auctionsPage;
  const [open, setOpen] = useState(false);
  // The sheet is portalled to <body>: inside the page it inherited an
  // ancestor's stacking context and the fixed bottom nav covered its button.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [pickedCity, setCity] = useState(city ?? "");
  const [pickedSort, setSort] = useState(sort);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const chip = (on: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
      on
        ? "bg-primary-500 border-primary-500 text-white"
        : "bg-white border-neutral-200 text-neutral-600",
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3.5 py-1.5 text-[13px] font-semibold text-white"
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="size-3.5" />
        {a.filter}
        {activeCount > 0 && (
          <span className="grid place-items-center size-4.5 rounded-full bg-primary-500 text-[10px]">
            {activeCount}
          </span>
        )}
      </button>

      {mounted &&
        createPortal(
          <>
            <div
              className={cn(
                "fixed inset-0 z-[60] bg-neutral-950/35 transition-opacity duration-300 md:hidden",
                open ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <form
              method="GET"
              action="/auctions"
              onSubmit={() => setOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={a.filterTitle}
              className={cn(
                "fixed inset-x-2 bottom-2 z-[70] flex max-h-[calc(100dvh-1rem)] flex-col rounded-[28px] border border-white/70 bg-white/95 pt-2.5 shadow-2xl backdrop-blur-xl backdrop-saturate-150 transition-transform duration-500 ease-[cubic-bezier(.25,1.2,.45,1)] md:hidden",
                open ? "translate-y-0" : "pointer-events-none translate-y-[110%]",
              )}
              inert={!open}
            >
              <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300" />
              <div className="flex shrink-0 items-center justify-between mb-3 px-4">
                <h2 className="font-display text-lg font-extrabold">{a.filterTitle}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid size-9 place-items-center rounded-full bg-neutral-100"
                  aria-label="إغلاق"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
                {category && <input type="hidden" name="category" value={category} />}
                {quick && <input type="hidden" name="quick" value={quick} />}
                <input
                  type="search"
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder={a.searchPlaceholder}
                  aria-label={a.searchPlaceholder}
                  className="input"
                />
                <p className="mt-4 mb-2 text-xs font-semibold text-neutral-500">{a.city}</p>
                <input type="hidden" name="city" value={pickedCity} />
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  <button type="button" className={chip(!pickedCity)} onClick={() => setCity("")}>
                    {t.filters.allCities}
                  </button>
                  {cities.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={chip(pickedCity === c)}
                      onClick={() => setCity(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <p className="mt-4 mb-2 text-xs font-semibold text-neutral-500">{a.sortLabel}</p>
                {pickedSort !== "ending" && <input type="hidden" name="sort" value={pickedSort} />}
                <div className="flex flex-wrap gap-1.5">
                  {sorts.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={chip(pickedSort === o.value)}
                      onClick={() => setSort(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* always reachable: pinned under the scrolling fields, above the home indicator */}
              <div className="shrink-0 border-t border-neutral-100 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
                <button type="submit" className="btn-primary w-full">
                  {a.showResults}
                </button>
              </div>
            </form>
          </>,
          document.body,
        )}
    </>
  );
}
