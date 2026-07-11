/**
 * Category-specific listing fields. Keyed by the MAIN category slug (the sell
 * form resolves a subcategory to its parent). Each group decides which generic
 * fields make sense (condition / delivery / price label) and adds its own
 * structured attributes used for display, search, and filtering.
 */
export type FieldType = "select" | "number" | "text";

export type CategoryField = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  suffix?: string;
  required?: boolean;
  /** show as a quick filter on category/listing pages */
  filterable?: boolean;
};

export type CategoryConfig = {
  showCondition: boolean;
  showDelivery: boolean;
  priceLabel: string; // e.g. "السعر" | "الإيجار السنوي" | "الراتب الشهري"
  fields: CategoryField[];
};

const CAR_BRANDS = [
  "تويوتا", "لكزس", "نيسان", "هيونداي", "كيا", "فورد", "شيفروليه",
  "جي إم سي", "مرسيدس", "بي إم دبليو", "أودي", "هوندا", "مازda", "ميتسوبيشي",
  "دودج", "لاند روفر", "بورش", "جيب", "أخرى",
];

const PHONE_BRANDS = ["آيفون", "سامسونج", "هواوي", "شاومي", "أوبو", "جوجل", "أخرى"];

const DEFAULT: CategoryConfig = {
  showCondition: true,
  showDelivery: true,
  priceLabel: "السعر (ر.س)",
  fields: [],
};

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  cars: {
    showCondition: true,
    showDelivery: false, // vehicles are inspected & picked up, not shipped
    priceLabel: "السعر (ر.س)",
    fields: [
      { key: "brand", label: "الماركة", type: "select", options: CAR_BRANDS, required: true, filterable: true },
      { key: "model", label: "الموديل", type: "text" },
      { key: "year", label: "سنة الصنع", type: "number", filterable: true },
      { key: "mileage", label: "الممشى", type: "number", suffix: "كم" },
      { key: "transmission", label: "ناقل الحركة", type: "select", options: ["أوتوماتيك", "عادي"] },
      { key: "fuel", label: "الوقود", type: "select", options: ["بنزين", "ديزل", "هجين", "كهرباء"] },
      { key: "color", label: "اللون", type: "text" },
    ],
  },
  realestate: {
    showCondition: false,
    showDelivery: false,
    priceLabel: "السعر / الإيجار (ر.س)",
    fields: [
      { key: "purpose", label: "الغرض", type: "select", options: ["للبيع", "للإيجار"], required: true, filterable: true },
      { key: "area", label: "المساحة", type: "number", suffix: "م²", filterable: true },
      { key: "rooms", label: "غرف النوم", type: "number", filterable: true },
      { key: "bathrooms", label: "دورات المياه", type: "number" },
      { key: "floor", label: "الدور", type: "number" },
      { key: "furnished", label: "الأثاث", type: "select", options: ["مفروش", "غير مفروش"] },
    ],
  },
  electronics: {
    showCondition: true,
    showDelivery: true,
    priceLabel: "السعر (ر.س)",
    fields: [
      { key: "brand", label: "الماركة", type: "select", options: PHONE_BRANDS, filterable: true },
      { key: "storage", label: "السعة التخزينية", type: "select", options: ["64GB", "128GB", "256GB", "512GB", "1TB", "أخرى"] },
      { key: "warranty", label: "الضمان", type: "select", options: ["يوجد ضمان", "بدون ضمان"] },
    ],
  },
  furniture: {
    showCondition: true,
    showDelivery: true,
    priceLabel: "السعر (ر.س)",
    fields: [{ key: "material", label: "الخامة", type: "text" }],
  },
  fashion: {
    showCondition: true,
    showDelivery: true,
    priceLabel: "السعر (ر.س)",
    fields: [
      { key: "brand", label: "الماركة", type: "text", filterable: true },
      { key: "gender", label: "الفئة", type: "select", options: ["رجالي", "نسائي", "أطفال", "للجنسين"], filterable: true },
      { key: "size", label: "المقاس", type: "text" },
      { key: "color", label: "اللون", type: "text" },
    ],
  },
  animals: {
    showCondition: false,
    showDelivery: false,
    priceLabel: "السعر (ر.س)",
    fields: [
      { key: "age", label: "العمر", type: "text" },
      { key: "gender", label: "الجنس", type: "select", options: ["ذكر", "أنثى"] },
      { key: "vaccinated", label: "التطعيم", type: "select", options: ["مطعّم", "غير مطعّم"] },
    ],
  },
  sports: DEFAULT,
  services: {
    showCondition: false,
    showDelivery: false,
    priceLabel: "السعر التقريبي (ر.س)",
    fields: [{ key: "serviceType", label: "نوع الخدمة", type: "text" }],
  },
  business: {
    showCondition: true,
    showDelivery: false,
    priceLabel: "السعر (ر.س)",
    fields: [],
  },
  jobs: {
    showCondition: false,
    showDelivery: false,
    priceLabel: "الراتب الشهري (ر.س)",
    fields: [
      { key: "jobType", label: "نوع الدوام", type: "select", options: ["دوام كامل", "دوام جزئي", "عن بعد", "تدريب"], required: true, filterable: true },
      { key: "experience", label: "الخبرة المطلوبة", type: "text" },
    ],
  },
  other: DEFAULT,
};

export function configForMain(mainSlug: string): CategoryConfig {
  return CATEGORY_CONFIG[mainSlug] ?? DEFAULT;
}

/**
 * The user's GOAL drives the whole sell flow. Not everything is a product to
 * sell: a job opening can't go to auction, and a service is announced rather
 * than bid on. Each goal decides which main categories make sense.
 *
 *   SELL     — a priced product: everything except jobs
 *   AUCTION  — bidding needs a transferable good: no jobs, no services
 *   ANNOUNCE — an announcement (وظيفة، خدمة، إيجار...): price optional
 */
export type ListingGoal = "SELL" | "AUCTION" | "ANNOUNCE";

export const GOAL_RULES: Record<
  ListingGoal,
  { exclude?: string[]; include?: string[] }
> = {
  SELL: { exclude: ["jobs"] },
  AUCTION: { exclude: ["jobs", "services"] },
  ANNOUNCE: { include: ["jobs", "services", "realestate", "other"] },
};

export function goalAllowsCategory(goal: ListingGoal, mainSlug: string): boolean {
  const rule = GOAL_RULES[goal];
  if (rule.include) return rule.include.includes(mainSlug);
  return !rule.exclude?.includes(mainSlug);
}

/** Does this goal require a price? Announcements may omit it (على السوم). */
export function goalRequiresPrice(goal: ListingGoal): boolean {
  return goal !== "ANNOUNCE";
}

/** Field labels for rendering saved attributes back on the listing page. */
export function fieldLabel(mainSlug: string, key: string): string {
  const cfg = configForMain(mainSlug);
  return cfg.fields.find((f) => f.key === key)?.label ?? key;
}
