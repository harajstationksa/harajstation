"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge, Gavel, ImagePlus, Loader2, Megaphone, Sparkles, Store, Tag, X } from "lucide-react";
import { AUCTION_DURATIONS, CITIES, CONDITIONS } from "@/lib/constants";
import {
  configForMain,
  goalAllowsCategory,
  goalRequiresPrice,
  GOAL_TYPE,
  type ListingGoal,
} from "@/lib/category-fields";
import { cn, formatSAR } from "@/lib/utils";
import { compressImage } from "@/lib/image-compress";
import { useLang } from "@/components/LangProvider";

type SubCat = { id: string; nameAr: string; nameEn: string };
type Cat = { id: string; slug: string; nameAr: string; nameEn: string; children: SubCat[] };
type StoreOpt = { id: string; name: string };
type PriceGuide = { count: number; p25?: number; median?: number; p75?: number };


function SectionCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 space-y-4">
      <h2 className="font-bold flex items-center gap-2.5">
        <span className="size-6 rounded-md bg-neutral-900 text-white text-xs flex items-center justify-center shrink-0">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SellForm({
  categories,
  stores,
  canListing,
  canAuction,
  isPro = false,
}: {
  categories: Cat[];
  stores: StoreOpt[];
  canListing: boolean;
  canAuction: boolean;
  isPro?: boolean;
}) {
  const router = useRouter();
  const { lang, t } = useLang();
  const d = t.sellForm;
  const [goal, setGoal] = useState<ListingGoal | "">("");
  const [categoryId, setCategoryId] = useState("");
  const type = GOAL_TYPE[goal || "SELL"];
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [description, setDescription] = useState("");
  const [imgNote, setImgNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [guide, setGuide] = useState<PriceGuide | null>(null);
  // bumped on any keystroke so the quality meter re-reads the (uncontrolled)
  // spec/neighborhood fields without making every input controlled
  const [tick, setTick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  /** PRO: turn the seller's rough words into a ready title + description. */
  async function aiWrite() {
    const hint = (description.trim() || title.trim()).slice(0, 500);
    if (hint.length < 5 || !categoryId || aiBusy) return;
    setAiBusy(true);
    setAiError("");
    try {
      const fd = formRef.current ? new FormData(formRef.current) : null;
      const attributes: Record<string, string> = {};
      for (const f of cfg.fields) {
        const v = String(fd?.get(`attr_${f.key}`) ?? "").trim();
        if (v) attributes[f.label] = v;
      }
      const res = await fetch("/api/listings/ai-describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hint, categoryId, goal: goal || "SELL", attributes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiError(data.error ?? d.aiFail);
      } else {
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
      }
    } catch {
      setAiError(d.aiFail);
    }
    setAiBusy(false);
  }

  // resolve the main category of the selected subcategory to pick its field set
  const mainSlug = useMemo(() => {
    for (const cat of categories) {
      if (cat.id === categoryId) return cat.slug;
      if (cat.children.some((c) => c.id === categoryId)) return cat.slug;
    }
    return "";
  }, [categoryId, categories]);

  const cfg = configForMain(mainSlug);

  // only categories that make sense for the chosen goal (a job opening can't
  // be auctioned; an auction needs a transferable good)
  const goalCategories = useMemo(
    () => (goal ? categories.filter((c) => goalAllowsCategory(goal, c.slug)) : []),
    [goal, categories]
  );

  function pickGoal(g: ListingGoal) {
    setGoal(g);
    // drop a selection that the new goal doesn't allow
    const stillValid = mainSlug && goalAllowsCategory(g, mainSlug);
    if (!stillValid) setCategoryId("");
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setImgNote("");
    const kept: File[] = [];
    let compressed = 0;
    let rejected = 0;
    for (const f of Array.from(list)) {
      const result = await compressImage(f);
      if (!result) {
        rejected++;
        continue;
      }
      if (result !== f) compressed++;
      kept.push(result);
    }
    if (compressed > 0) setImgNote(d.compressed(compressed));
    if (rejected > 0)
      setImgNote((n) => `${n ? n + " · " : ""}${d.rejected(rejected)}`);
    setFiles((prev) => [...prev, ...kept].slice(0, 10));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    fd.set("goal", goal || "SELL");
    fd.delete("images");
    files.forEach((f) => fd.append("images", f));

    const res = await fetch("/api/listings", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? d.publishFail);
      setFieldErrors(data.fields ?? {});
      setLoading(false);
      return;
    }
    router.push(data.auctionId ? `/auctions/${data.auctionId}` : `/listings/${data.id}`);
  }

  // ── price guide: what similar items go for, fetched as the seller types ──
  useEffect(() => {
    const id = setTimeout(async () => {
      if (!categoryId || goal !== "SELL") {
        setGuide(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/listings/price-guide?category=${categoryId}&q=${encodeURIComponent(title)}`
        );
        if (res.ok) setGuide(await res.json());
      } catch {
        /* guidance is optional — never block the form */
      }
    }, 600);
    return () => clearTimeout(id);
  }, [categoryId, title, goal]);

  const priceNum = Number(price) || 0;
  const showGuide = guide != null && guide.count >= 3 && guide.p25 != null;
  const priceHigh = showGuide && priceNum > 0 && priceNum > guide.p75! * 1.2;
  const priceLow = showGuide && priceNum > 0 && priceNum < guide.p25! * 0.8;

  // ── listing quality: reads the live form; complete listings sell faster ──
  const [quality, setQuality] = useState<{ pct: number; hints: string[] }>({
    pct: 0,
    hints: [],
  });
  useEffect(() => {
    // deferred so the (uncontrolled) spec/neighborhood fields are read outside
    // render; `tick` re-runs this on every keystroke
    void tick;
    const id = setTimeout(() => {
      const fd = formRef.current ? new FormData(formRef.current) : null;
      const neighborhood = String(fd?.get("neighborhood") ?? "").trim();
      let specFilled = 0;
      for (const f of cfg.fields) {
        if (String(fd?.get(`attr_${f.key}`) ?? "").trim()) specFilled++;
      }
      const specRatio = cfg.fields.length > 0 ? specFilled / cfg.fields.length : 1;

      let pct = 0;
      const hints: string[] = [];
      if (files.length >= 3) pct += 30;
      else if (files.length >= 1) {
        pct += 15;
        hints.push(d.qHintMorePhotos);
      } else hints.push(d.qHintPhotos);
      if (description.length >= 80) pct += 25;
      else {
        pct += Math.round((description.length / 80) * 15);
        hints.push(d.qHintDesc);
      }
      if (title.trim().length >= 15) pct += 15;
      else hints.push(d.qHintTitle);
      pct += Math.round(specRatio * 20);
      if (specRatio < 1) hints.push(d.qHintSpecs);
      if (neighborhood) pct += 10;
      else hints.push(d.qHintNeighborhood);
      setQuality({ pct: Math.min(100, pct), hints: hints.slice(0, 2) });
    }, 150);
    return () => clearTimeout(id);
  }, [tick, files, description, title, cfg, d]);

  const isAuction = type === "AUCTION";
  const typeBlocked = isAuction ? !canAuction : !canListing;

  // sequential step numbering (fields section is conditional)
  const priceStep = cfg.fields.length > 0 ? 4 : 3;
  const storeStep = priceStep + 1;
  const imagesStep = storeStep + (stores.length > 0 ? 1 : 0);

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      onInput={() => setTick((v) => v + 1)}
      className="space-y-5"
    >
      {/* ── the goal drives everything: sell / auction / announce ── */}
      <div>
        <p className="font-bold mb-3">{d.goalQ}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { v: "SELL" as const, icon: Tag, title: d.sellT, sub: d.sellS, cls: "border-primary-500 bg-primary-50/50 ring-1 ring-primary-500", ic: "text-primary-500" },
            { v: "AUCTION" as const, icon: Gavel, title: d.aucT, sub: d.aucS, cls: "border-red-500 bg-red-50/50 ring-1 ring-red-500", ic: "text-red-500" },
            { v: "ANNOUNCE" as const, icon: Megaphone, title: d.annT, sub: d.annS, cls: "border-sky-500 bg-sky-50/50 ring-1 ring-sky-500", ic: "text-sky-500" },
          ].map(({ v, icon: Icon, title, sub, cls, ic }) => (
            <button
              key={v}
              type="button"
              onClick={() => pickGoal(v)}
              className={cn(
                "rounded-xl border p-4 text-right transition-all cursor-pointer",
                goal === v ? cls : "border-neutral-200 bg-white hover:border-neutral-300"
              )}
            >
              <Icon className={cn("size-6 mb-2", goal === v ? ic : "text-neutral-400")} />
              <p className="font-bold">{title}</p>
              <p className="text-xs text-neutral-500 mt-1">{sub}</p>
            </button>
          ))}
        </div>
        {!goal && (
          <p className="text-xs text-neutral-400 mt-2">
            {d.goalFirst}
          </p>
        )}
      </div>

      {goal && typeBlocked && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {isAuction ? d.limitAuc : d.limitList}
        </p>
      )}

      {/* 1 — category (filtered by the goal) */}
      {goal && (
        <SectionCard step={1} title={d.category}>
          <select
            name="categoryId"
            className={`input ${fieldErrors.categoryId ? "border-red-400 ring-2 ring-red-500/15" : ""}`}
            required
            value={categoryId}
            // commit on `input`, not just `change`: the form-level onInput above
            // re-renders on every input event, and that re-render re-applies the
            // controlled value to this select BETWEEN the browser's input and
            // change events — wiping the user's pick before change ever fires.
            onInput={(e) => setCategoryId(e.currentTarget.value)}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="" disabled>{d.pickCat}</option>
            {goalCategories.map((cat) =>
              cat.children.length > 0 ? (
                <optgroup key={cat.id} label={lang === "en" ? cat.nameEn : cat.nameAr}>
                  {cat.children.map((child) => (
                    <option key={child.id} value={child.id}>{lang === "en" ? child.nameEn : child.nameAr}</option>
                  ))}
                </optgroup>
              ) : (
                <option key={cat.id} value={cat.id}>{lang === "en" ? cat.nameEn : cat.nameAr}</option>
              )
            )}
          </select>
          {!categoryId && (
            <p className="text-xs text-neutral-400">
              {goal === "AUCTION" ? d.catHintAuction : goal === "ANNOUNCE" ? d.catHintAnnounce : d.catHintSell}
            </p>
          )}
        </SectionCard>
      )}

      {/* 2 — basic details (revealed after category) */}
      {categoryId && (
        <SectionCard step={2} title={d.details}>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {d.titleL} <span className="text-xs text-neutral-400 font-normal">{d.titleMin}</span>
            </label>
            <input
              name="title"
              className={`input ${fieldErrors.title ? "border-red-400 ring-2 ring-red-500/15" : ""}`}
              required
              minLength={4}
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={d.titlePh}
            />
            {fieldErrors.title && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.title}</p>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">
                {d.descL} <span className="text-xs text-neutral-400 font-normal">{d.descMin}</span>
              </label>
              <span
                className={`text-xs tabular-nums ${
                  description.length > 0 && description.length < 20
                    ? "text-red-500 font-semibold"
                    : "text-neutral-400"
                }`}
              >
                {description.length}/5000
                {description.length > 0 && description.length < 20 && d.descLeft(20 - description.length)}
              </span>
            </div>
            <textarea
              name="description"
              className={`input min-h-32 py-3 ${fieldErrors.description ? "border-red-400 ring-2 ring-red-500/15" : ""}`}
              required
              minLength={20}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={d.descPh}
            />
            {fieldErrors.description && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.description}</p>
            )}
            {/* AI writer: rough words in → market-ready title + description out */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {isPro ? (
                <button
                  type="button"
                  onClick={aiWrite}
                  disabled={aiBusy || (description.trim() || title.trim()).length < 5}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3.5 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                  {aiBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {aiBusy ? d.aiWriting : d.aiWrite}
                </button>
              ) : (
                <a
                  href="/pro"
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3.5 py-1.5 text-xs font-semibold text-neutral-500 hover:border-primary-300 hover:text-primary-700 transition-colors"
                >
                  <Sparkles className="size-3.5" />
                  {d.aiProOnly}
                </a>
              )}
              <span className="text-[11px] text-neutral-400">{d.aiHint}</span>
            </div>
            {aiError && <p className="text-xs text-red-600 mt-1">{aiError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {cfg.showCondition && (
              <div>
                <label className="block text-sm font-medium mb-1.5">{d.condition}</label>
                <select name="condition" className="input" defaultValue="USED">
                  {Object.keys(CONDITIONS).map((k) => (
                    <option key={k} value={k}>{t.card.conditions[k] ?? k}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1.5">{d.city}</label>
              <select name="city" className="input" defaultValue="الرياض">
                {CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                {d.neighborhood} <span className="text-neutral-400">{d.optional}</span>
              </label>
              <input name="neighborhood" className="input" placeholder={d.neighborhoodPh} />
            </div>
            {cfg.showDelivery && (
              <div>
                <label className="block text-sm font-medium mb-1.5">{d.delivery}</label>
                <select name="deliveryMethod" className="input" defaultValue="PICKUP">
                  <option value="PICKUP">{d.dPickup}</option>
                  <option value="SHIPPING">{d.dShipping}</option>
                  <option value="DELIVERY">{d.dDelivery}</option>
                </select>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* 3 — category-specific fields */}
      {categoryId && cfg.fields.length > 0 && (
        <SectionCard step={3} title={d.specs}>
          <div className="grid grid-cols-2 gap-3">
            {cfg.fields.map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium mb-1.5">
                  {f.label}
                  {!f.required && <span className="text-neutral-400"> {d.optional}</span>}
                </label>
                {f.type === "select" ? (
                  <select
                    name={`attr_${f.key}`}
                    className={cn("input", fieldErrors[`attr_${f.key}`] && "border-red-400 ring-2 ring-red-500/15")}
                    defaultValue=""
                    required={f.required}
                  >
                    <option value="">{d.pick}</option>
                    {f.options!.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <div className="relative">
                    <input
                      name={`attr_${f.key}`}
                      className={cn(
                        "input",
                        f.suffix && "pe-12",
                        fieldErrors[`attr_${f.key}`] && "border-red-400 ring-2 ring-red-500/15"
                      )}
                      required={f.required}
                      inputMode={f.type === "number" ? "numeric" : "text"}
                      pattern={f.type === "number" ? "\\d*" : undefined}
                    />
                    {f.suffix && (
                      <span className="absolute inset-y-0 end-3 flex items-center text-xs text-neutral-400 pointer-events-none">
                        {f.suffix}
                      </span>
                    )}
                  </div>
                )}
                {fieldErrors[`attr_${f.key}`] && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors[`attr_${f.key}`]}</p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 4 — pricing / auction */}
      {categoryId && (
        <SectionCard step={priceStep} title={isAuction ? d.aucSettings : d.price}>
          {!isAuction ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  {cfg.priceLabel}
                  {goal === "ANNOUNCE" && <span className="text-neutral-400">{d.priceOptional}</span>}
                </label>
                <input
                  name="price"
                  className={cn("input", fieldErrors.price && "border-red-400 ring-2 ring-red-500/15")}
                  required={goal !== "ANNOUNCE" && goalRequiresPrice(goal || "SELL")}
                  inputMode="numeric"
                  pattern="\d*"
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder={d.pricePh}
                />
                {fieldErrors.price && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.price}</p>
                )}
                {showGuide && (
                  <div className="mt-2 rounded-lg bg-neutral-50 border border-neutral-100 px-3 py-2 text-xs text-neutral-600 space-y-1">
                    <p>{d.pgLabel(guide!.count)}</p>
                    <p className="font-semibold text-neutral-800 tabular-nums">
                      {d.pgRange}: {formatSAR(guide!.p25!)} – {formatSAR(guide!.p75!)}
                      <span className="text-neutral-400 font-normal"> · </span>
                      {d.pgMedian}: {formatSAR(guide!.median!)}
                    </p>
                    {priceHigh && <p className="text-amber-700 font-semibold">{d.pgHigh}</p>}
                    {priceLow && <p className="text-amber-700 font-semibold">{d.pgLow}</p>}
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="showPhone" defaultChecked className="size-4 accent-primary-500" />
                {d.showPhone}
              </label>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{d.startPrice}</label>
                  <input name="startPrice" className="input" required inputMode="numeric" pattern="\d+" placeholder="1000" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{d.minIncrement}</label>
                  <input name="minIncrement" className="input" required inputMode="numeric" pattern="\d+" defaultValue="50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{d.duration}</label>
                  <select name="durationHours" className="input" defaultValue="72">
                    {AUCTION_DURATIONS.map((dur) => (
                      <option key={dur.hours} value={dur.hours}>{lang === "en" ? dur.labelEn : dur.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {d.buyNow} <span className="text-neutral-400">{d.optional}</span>
                  </label>
                  <input name="buyNowPrice" className="input" inputMode="numeric" pattern="\d*" placeholder={d.buyNowPh} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  {d.terms} <span className="text-neutral-400">{d.optional}</span>
                </label>
                <textarea name="terms" className="input min-h-20 py-3" placeholder={d.termsPh} />
              </div>
              <p className="text-xs text-neutral-500 bg-neutral-50 rounded-lg p-3 leading-relaxed">
                {d.aucProtect}
              </p>
            </>
          )}
        </SectionCard>
      )}

      {/* store + images */}
      {categoryId && (
        <>
          {stores.length > 0 && (
            <SectionCard step={storeStep} title={d.store}>
              <div>
                <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <Store className="size-4 text-neutral-400" />
                  {d.storeL} <span className="text-neutral-400">{d.optional}</span>
                </label>
                <select name="storeId" className="input" defaultValue="">
                  <option value="">{d.noStore}</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </SectionCard>
          )}

          <SectionCard step={imagesStep} title={d.photos}>
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 py-8 cursor-pointer hover:border-primary-400 hover:bg-primary-50/40 transition-colors">
              <ImagePlus className="size-8 text-neutral-400" />
              <span className="text-sm text-neutral-500">
                {d.photosHint}
              </span>
              <input
                type="file"
                name="images"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
            {files.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {files.map((f, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={URL.createObjectURL(f)} alt="" className="size-20 rounded-lg object-cover border border-neutral-200" />
                    {i === 0 && (
                      <span className="absolute bottom-1 right-1 badge bg-primary-500 text-white text-[10px]">{d.cover}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -left-1.5 size-5 rounded-full bg-neutral-900 text-white flex items-center justify-center cursor-pointer"
                      aria-label={d.removePhoto}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {imgNote && <p className="text-xs text-amber-700">{imgNote}</p>}
            <p className="text-xs text-neutral-400">{d.noPhotos}</p>
          </SectionCard>
        </>
      )}

      {/* listing quality meter — complete listings get more contacts */}
      {categoryId && (
        <div className="card p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm flex items-center gap-2">
              <Gauge className="size-4.5 text-primary-500" />
              {d.qTitle}
            </p>
            <span
              className={cn(
                "badge",
                quality.pct >= 75
                  ? "bg-green-50 text-green-700"
                  : quality.pct >= 45
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-600"
              )}
            >
              {quality.pct >= 75 ? d.qStrong : quality.pct >= 45 ? d.qMedium : d.qWeak}
              <span className="tabular-nums">· {quality.pct}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                quality.pct >= 75
                  ? "bg-green-500"
                  : quality.pct >= 45
                    ? "bg-amber-400"
                    : "bg-red-400"
              )}
              style={{ width: `${quality.pct}%` }}
            />
          </div>
          {quality.hints.length > 0 && (
            <ul className="text-xs text-neutral-500 space-y-1 ps-4 list-disc marker:text-primary-400">
              {quality.hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* disclaimer */}
      {categoryId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <p className="text-xs text-amber-900 leading-relaxed">
            <b>{d.disclaimerB}</b> {d.disclaimer}
          </p>
          <label className="flex items-start gap-2.5 text-sm font-medium text-amber-900 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="size-4 accent-primary-500 mt-0.5 shrink-0"
            />
            {d.ack}
          </label>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      {categoryId && (
        <button className="btn-primary w-full text-base" disabled={loading || typeBlocked || !accepted}>
          {loading && <Loader2 className="size-4 animate-spin" />}
          {goal === "AUCTION" ? d.submitAuc : goal === "ANNOUNCE" ? d.submitAnn : d.submitSell}
        </button>
      )}
    </form>
  );
}
