import { ListChecks } from "lucide-react";
import { configForMain } from "@/lib/category-fields";

/**
 * Render a listing's category-specific attributes as a clean spec grid,
 * labeled via the category field config (keys → Arabic labels + suffix).
 */
export function SpecList({
  attributes,
  mainSlug,
}: {
  attributes: string;
  mainSlug: string;
}) {
  let attrs: Record<string, string> = {};
  try {
    const parsed = JSON.parse(attributes);
    if (parsed && typeof parsed === "object") attrs = parsed;
  } catch {
    /* ignore */
  }
  const cfg = configForMain(mainSlug);
  const rows = cfg.fields
    .filter((f) => attrs[f.key])
    .map((f) => {
      let value = attrs[f.key];
      if (f.suffix) value = `${value} ${f.suffix}`;
      if (f.key === "mileage" || f.key === "area") {
        const n = Number(attrs[f.key]);
        if (Number.isFinite(n)) value = `${n.toLocaleString("en-US")}${f.suffix ? ` ${f.suffix}` : ""}`;
      }
      return { label: f.label, value };
    });

  if (rows.length === 0) return null;

  return (
    <div className="card p-5 space-y-3">
      <h2 className="font-bold flex items-center gap-2">
        <ListChecks className="size-5 text-primary-500" />
        المواصفات
      </h2>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg bg-neutral-50 border border-neutral-100 px-3 py-2">
            <dt className="text-xs text-neutral-400">{r.label}</dt>
            <dd className="text-sm font-semibold text-neutral-800 mt-0.5">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Compact inline specs strip for cards (top 3 attributes). */
export function specSummary(attributes: string, mainSlug: string): string[] {
  let attrs: Record<string, string> = {};
  try {
    const parsed = JSON.parse(attributes);
    if (parsed && typeof parsed === "object") attrs = parsed;
  } catch {
    return [];
  }
  const cfg = configForMain(mainSlug);
  return cfg.fields
    .filter((f) => attrs[f.key])
    .slice(0, 3)
    .map((f) => (f.suffix ? `${attrs[f.key]} ${f.suffix}` : attrs[f.key]));
}
