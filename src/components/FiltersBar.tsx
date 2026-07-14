"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { CITIES } from "@/lib/constants";
import { configForMain, typesForMain, type ListingType } from "@/lib/category-fields";
import { cn } from "@/lib/utils";
import { useLang } from "./LangProvider";

/**
 * `mainSlug` is the MAIN category being browsed, or null on pages that span all
 * of them. It is what lets the bar offer only the filters this category can
 * actually answer — «وظائف» has no auctions and no «مستعمل».
 */
export function FiltersBar({
  basePath = "/listings",
  mainSlug = null,
}: {
  basePath?: string;
  mainSlug?: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const f = t.filters;

  const [city, setCity] = useState(sp.get("city") ?? "");
  const [condition, setCondition] = useState(sp.get("condition") ?? "");
  const [type, setType] = useState(sp.get("type") ?? "");
  const [min, setMin] = useState(sp.get("min") ?? "");
  const [max, setMax] = useState(sp.get("max") ?? "");
  const [sort, setSort] = useState(sp.get("sort") ?? "newest");

  const label: Record<ListingType, string> = {
    STANDARD: f.standard,
    AUCTION: f.auction,
    ANNOUNCE: f.announce,
  };
  const allowed = typesForMain(mainSlug);
  // one possible type is not a choice — «وظائف» is announcements, full stop
  const showTypes = allowed.length > 1;
  const typeOptions = [
    { value: "", label: f.bothTypes },
    ...allowed.map((v) => ({ value: v as string, label: label[v] })),
  ];
  // a stale or hand-edited ?type= that this category can't hold (an auction under
  // «وظائف») would otherwise return nothing, with no visible reason why
  const activeType = allowed.includes(type as ListingType) ? type : "";

  /** Rebuild the URL, keeping every param this bar doesn't own (q, category,
   *  featured…). Building from scratch used to drop them — arrive on
   *  /listings?category=cars, tweak the city, and the category vanished. */
  function push(next: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // a changed filter invalidates the page number — page 5 of the old result
    // set is usually empty in the new one
    params.delete("page");
    router.push(`${basePath}${params.size ? `?${params}` : ""}`);
    setOpen(false);
  }

  // "condition" is meaningless for a job, a service, or a property — the sell
  // form never asks for it there, so every row just carries the column default
  // and the filter would quietly sort job posts under «مستعمل». Ask the same
  // config the sell form asks, and drop it for announcements anywhere.
  const showCondition =
    activeType !== "ANNOUNCE" && (mainSlug ? configForMain(mainSlug).showCondition : true);

  function apply() {
    push({
      city,
      condition: showCondition ? condition : "",
      type: activeType,
      min,
      max,
      sort: sort === "newest" ? "" : sort,
    });
  }

  function reset() {
    setCity("");
    setCondition("");
    setType("");
    setMin("");
    setMax("");
    setSort("newest");
    // clears the filters, not the search — the "active" badge never counted q,
    // so wiping it here would clear something the button never claimed to
    push({ city: "", condition: "", type: "", min: "", max: "", sort: "" });
  }

  const active = [city, showCondition ? condition : "", activeType, min, max].filter(Boolean).length;

  return (
    <div className="card p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between sm:hidden font-semibold text-sm cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          {f.label} {active > 0 && <span className="badge bg-primary-500 text-white">{active}</span>}
        </span>
        <span className="text-neutral-400 text-xs">{open ? f.hide : f.show}</span>
      </button>

      <div className={`${open ? "block" : "hidden"} sm:block space-y-3 max-sm:mt-3`}>
        {/* type — segmented control, only where there is a choice to make */}
        {showTypes && (
          <div className="inline-flex rounded-lg bg-neutral-100 p-1 gap-1">
            {typeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer",
                  activeType === opt.value
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
          <select className="input" value={city} onChange={(e) => setCity(e.target.value)} aria-label={f.allCities}>
            <option value="">{f.allCities}</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {showCondition && (
            <select className="input" value={condition} onChange={(e) => setCondition(e.target.value)} aria-label={f.allConditions}>
              <option value="">{f.allConditions}</option>
              {Object.entries(t.card.conditions).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          )}

          <input
            className="input"
            inputMode="numeric"
            placeholder={f.priceFrom}
            value={min}
            onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ""))}
          />
          <input
            className="input"
            inputMode="numeric"
            placeholder={f.priceTo}
            value={max}
            onChange={(e) => setMax(e.target.value.replace(/[^\d]/g, ""))}
          />

          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="sort">
            <option value="newest">{f.sortNew}</option>
            <option value="price_asc">{f.sortPriceAsc}</option>
            <option value="price_desc">{f.sortPriceDesc}</option>
            <option value="views">{f.sortViews}</option>
          </select>

          <div className="flex gap-2 col-span-2 sm:col-span-1">
            <button onClick={apply} className="btn-primary flex-1">{f.apply}</button>
            {active > 0 && (
              <button onClick={reset} className="btn-secondary px-3" aria-label="reset">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
