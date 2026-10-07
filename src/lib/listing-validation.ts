import type { CategoryConfig } from "./category-fields";
import { z } from "zod";
import { CITIES } from "./constants";
export const listingFieldsSchema = z.object({
  title: z.string().trim().min(4).max(100),
  description: z.string().trim().min(20).max(5000),
  condition: z.enum(["NEW", "LIKE_NEW", "USED"]).optional(),
  city: z.enum(CITIES),
  neighborhood: z.string().max(60).optional(),
});
export const MAX_AMOUNT = 2_000_000_000;
export function validAmount(n: number) {
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_AMOUNT;
}
export function readAttributes(
  fd: FormData,
  cfg: CategoryConfig,
  existing: Record<string, string> = {},
) {
  const attributes: Record<string, string> = {},
    errors: Record<string, string> = {};
  for (const f of cfg.fields) {
    const key = `attr_${f.key}`;
    const value = String(fd.has(key) ? fd.get(key) : (existing[f.key] ?? "")).trim();
    if (!value) {
      if (f.required) errors[key] = `حقل "${f.label}" مطلوب`;
      continue;
    }
    if (
      value.length > 200 ||
      (f.type === "select" && !f.options?.includes(value)) ||
      (f.type === "number" &&
        (!Number.isFinite(Number(value)) || Math.abs(Number(value)) > MAX_AMOUNT))
    ) {
      errors[key] = `قيمة "${f.label}" غير صالحة`;
      continue;
    }
    attributes[f.key] = value;
  }
  return { attributes, errors };
}
