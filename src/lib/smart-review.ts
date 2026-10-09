import { normalizeArabic } from "./arabic";

export type RiskLevel = "NORMAL" | "SENSITIVE" | "REGULATED" | "PROHIBITED";
export type RiskCode =
  | "FINANCING"
  | "INSURANCE"
  | "INVESTMENT"
  | "RECRUITMENT"
  | "REAL_ESTATE"
  | "MEDICAL"
  | "WILDLIFE"
  | "VEHICLE_RENTAL"
  | "PROHIBITED_CONTENT"
  | "BANNED_WORD"
  | "DUPLICATE"
  | "MANUAL_REVIEW"
  | "ANALYSIS_FAILED";

export type ReviewResult = { level: RiskLevel; reasons: RiskCode[]; signals: string[] };
export const RISK_LABELS: Record<RiskLevel, string> = {
  NORMAL: "عادي",
  SENSITIVE: "يحتاج انتباه",
  REGULATED: "يحتاج تحقق",
  PROHIBITED: "محتوى محظور محتمل",
};
export const REASON_LABELS: Record<RiskCode, string> = {
  FINANCING: "تمويل أو سيولة",
  INSURANCE: "خدمة تأمين",
  INVESTMENT: "استثمار أو توصيات مالية",
  RECRUITMENT: "استقدام أو توفير عمالة",
  REAL_ESTATE: "إعلان عقاري",
  MEDICAL: "منتج طبي",
  WILDLIFE: "حياة فطرية",
  VEHICLE_RENTAL: "تأجير مركبات",
  PROHIBITED_CONTENT: "محتوى قد يكون محظورًا",
  BANNED_WORD: "قائمة المحتوى المحظور",
  DUPLICATE: "إعلان مشابه محتمل",
  MANUAL_REVIEW: "إحالة يدوية من المشرف",
  ANALYSIS_FAILED: "تعذر الفحص الآلي",
};

/** Short reviewer prompts, not legal conclusions or seller-facing warnings. */
export const REVIEW_GUIDANCE: Record<RiskCode, string> = {
  FINANCING: "تحقق من اسم الجهة المقدمة للخدمة وترخيصها وعلاقة المعلن بها.",
  INSURANCE: "تحقق من صفة مقدم التأمين أو الوسيط والجهة المرخصة.",
  INVESTMENT: "تحقق من طبيعة المشورة أو إدارة الأموال وصفة مقدم الخدمة.",
  RECRUITMENT: "تحقق من بيانات المنشأة وتصريح الاستقدام أو توفير العمالة عند انطباقه.",
  REAL_ESTATE: "راجع رقم ترخيص الإعلان العقاري وحالته عندما تتطلبه الحالة.",
  MEDICAL: "تحقق من طبيعة المنتج ومتطلبات إعلانه أو تداوله.",
  WILDLIFE: "تحقق من نوع الحيوان ومتطلبات الملكية أو التداول والتصاريح.",
  VEHICLE_RENTAL: "تحقق من بيانات مقدم نشاط التأجير عند الحاجة.",
  PROHIBITED_CONTENT: "افحص الصور والوصف يدويًا قبل أي قرار؛ لا تعتمد على العبارة وحدها.",
  BANNED_WORD: "راجع الكلمة ضمن سياق الإعلان؛ قد تكون حالة إنذار خاطئ.",
  DUPLICATE: "قارن الإعلانات الأخرى للبائع قبل اتخاذ قرار.",
  MANUAL_REVIEW: "راجع السبب المدوّن في سجل المشرف وبيانات الإعلان.",
  ANALYSIS_FAILED: "تعذر الفحص الآلي؛ راجع الإعلان كاملًا يدويًا.",
};

export const REVIEW_REQUEST_TEMPLATES = {
  FINANCING:
    "يرجى تزويدنا باسم الجهة المرخصة المقدمة للخدمة وما يثبت ارتباطك بها قبل اعتماد الإعلان.",
  INSURANCE: "يرجى تزويدنا ببيانات الجهة المقدمة للتأمين وما يثبت صفتك في عرض الخدمة.",
  INVESTMENT: "يرجى توضيح الجهة المقدمة للخدمة الاستثمارية وما يثبت صفتها النظامية.",
  RECRUITMENT: "يرجى تزويدنا ببيانات المنشأة أو الترخيص المرتبط بخدمة الاستقدام أو توفير العمالة.",
  REAL_ESTATE: "يرجى تزويدنا برقم ترخيص الإعلان العقاري أو المعلومات النظامية المطلوبة للإعلان.",
  GENERAL:
    "نحتاج إلى معلومات إضافية للتحقق من الإعلان قبل نشره. يرجى توضيح طبيعة العرض وصفتك كمعلن.",
} as const;

// Simple switches for the first release. A reviewer still makes the final decision.
export const REVIEW_RULES = {
  financing: true,
  insurance: true,
  investment: true,
  recruitment: true,
  realEstate: true,
  medical: true,
  wildlife: true,
  vehicleRental: true,
  prohibited: true,
  duplicate: true,
} as const;

const rank: Record<RiskLevel, number> = { NORMAL: 0, SENSITIVE: 1, REGULATED: 2, PROHIBITED: 3 };
const normalize = (value: string) =>
  normalizeArabic(value)
    .replace(/[\u200b-\u200f\u2060]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const compact = (value: string) => value.replace(/\s+/g, "");
const has = (value: string, terms: readonly string[]) =>
  terms.some((term) => value.includes(normalize(term)));

export function addReviewReason(
  result: ReviewResult,
  level: RiskLevel,
  reason: RiskCode,
  signal: string,
): ReviewResult {
  return {
    level: rank[level] > rank[result.level] ? level : result.level,
    reasons: result.reasons.includes(reason) ? result.reasons : [...result.reasons, reason],
    // Fixed rule names only; never persist an advertiser's free text as a signal.
    signals: result.signals.includes(signal) ? result.signals : [...result.signals, signal],
  };
}

export function classifyListing(input: {
  title: string;
  description: string;
  categorySlug: string;
  parentSlug?: string | null;
  categoryName?: string;
  attributes?: Record<string, string>;
}): ReviewResult {
  const text = normalize(
    [input.title, input.description, ...Object.values(input.attributes ?? {})].join(" "),
  );
  const tight = compact(text);
  const category = normalize(
    [input.parentSlug, input.categorySlug, input.categoryName].filter(Boolean).join(" "),
  );
  const offer = has(text, [
    "نوفر",
    "نقدم",
    "احصل",
    "نطلع",
    "نحول",
    "نسدد",
    "نمول",
    "استلم",
    "تواصل",
    "خدمة",
    "بيع",
    "للبيع",
    "اطلب",
    "اصدار",
    "تجديد",
    "وسيط",
    "مكتب",
    "شركة",
    "we offer",
    "available",
    "apply now",
  ]);
  let result: ReviewResult = { level: "NORMAL", reasons: [], signals: [] };
  const add = (level: RiskLevel, reason: RiskCode, signal: string) => {
    result = addReviewReason(result, level, reason, signal);
  };

  if (REVIEW_RULES.prohibited) {
    const explicit = has(text, [
      "هوية للبيع",
      "بيع هويات",
      "وثائق مزورة",
      "جوازات مزورة",
      "تزوير وثائق",
      "حساب بنكي للبيع",
      "بطاقة بنكية للبيع",
      "بيع بيانات مسروقة",
      "بيانات مسروقة",
      "اختراق حسابات",
      "تهكير حسابات",
      "سرقة حسابات",
      "spyware",
      "password stealing",
      "تقليد درجة اولى",
      "هاي كوبي",
      "fake original",
      "نسخة طبق الاصل",
      "replica",
    ]);
    const tobacco = has(text, ["سجائر", "تبغ", "فيب", "نيكوتين", "vape", "tobacco"]) && offer;
    const drugs = has(text, ["مخدرات", "حشيش", "كبتاجون", "cocaine"]) && offer;
    const weapons = has(text, ["سلاح بدون ترخيص", "مسدس للبيع", "ذخيرة للبيع"]);
    if (explicit || tobacco || drugs || weapons)
      add("PROHIBITED", "PROHIBITED_CONTENT", "عبارة عرض محظور واضحة");
  }

  if (REVIEW_RULES.financing) {
    const brand = has(text, ["تابي", "تمارا", "امكان", "ميس باي", "tabby", "tamara", "mis pay"]);
    const cash = has(text, [
      "كاش",
      "سيولة",
      "تسييل",
      "نقدا",
      "تحويل حد",
      "سحب رصيد",
      "cash",
      "liquidity",
    ]);
    const finance = has(text, [
      "تمويل",
      "قرض",
      "قروض",
      "سلفة",
      "سداد مديونية",
      "فك تعثر",
      "finance",
      "loan",
    ]);
    const strong = has(text, [
      "قروض فورية",
      "تمويل بدون كفيل",
      "تمويل للمتعثرين",
      "سداد مديونية",
      "فك تعثر",
      "تسييل",
    ]);
    const obfuscatedBrandCash =
      /(?:تابي|تمارا|tabby|tamara).{0,16}(?:كاش|سيول|cash)|(?:كاش|سيول|cash).{0,16}(?:تابي|تمارا|tabby|tamara)/u.test(
        tight,
      );
    if ((brand && cash) || obfuscatedBrandCash || strong || (finance && offer))
      add("REGULATED", "FINANCING", "عرض تمويل أو تحويل حد إلى نقد");
  }
  if (
    REVIEW_RULES.insurance &&
    ((has(text, ["تامين", "insurance"]) &&
      has(text, ["نصدر", "اصدار", "تجديد", "ارخص", "نوفر", "وسيط", "وثيقة", "policy", "sell"])) ||
      has(text, ["وثيقة تامين", "insurance policy"]))
  )
    add("REGULATED", "INSURANCE", "عرض إصدار أو وساطة تأمين");

  if (
    REVIEW_RULES.investment &&
    has(text, [
      "ادارة محافظ",
      "ادارة محفظتك",
      "توصيات اسهم",
      "توصيات مدفوعة",
      "تداول بالنيابة",
      "استثمر معنا",
      "ارباح مضمونة",
      "ربح مضمون",
      "استثمار مضمون",
      "portfolio management",
      "trading signals",
      "guaranteed returns",
      "forex signals",
    ])
  )
    add("REGULATED", "INVESTMENT", "عرض استثمار أو مشورة مالية");

  if (
    REVIEW_RULES.recruitment &&
    has(text, [
      "استقدام",
      "توفير عمالة",
      "نوفر عمال",
      "نوفر سائقين",
      "نوفر عاملات",
      "عمالة للشركات",
      "نقل خدمات مقابل مبلغ",
      "توظيف مقابل رسوم",
      "recruitment agency",
      "manpower supply",
      "labor supply",
    ])
  )
    add("REGULATED", "RECRUITMENT", "عرض استقدام أو توفير عمالة");

  if (
    REVIEW_RULES.realEstate &&
    (category.includes("realestate") ||
      category.includes("عقار") ||
      (has(text, ["فيلا", "شقة", "ارض سكنية", "عمارة", "عقار"]) &&
        has(text, ["للبيع", "للايجار", "ايجار"])))
  )
    add("REGULATED", "REAL_ESTATE", "إعلان عن عقار");

  if (
    REVIEW_RULES.medical &&
    has(text, [
      "جهاز طبي",
      "اجهزة طبية",
      "معدات طبية",
      "مستلزمات طبية",
      "كرسي متحرك",
      "medical device",
    ])
  )
    add("SENSITIVE", "MEDICAL", "منتج أو جهاز طبي");

  if (
    REVIEW_RULES.wildlife &&
    has(text, ["صقر", "صقور", "حيوان بري", "حياة فطرية", "wildlife", "falcon"]) &&
    (offer || category.includes("animals") || category.includes("حيوان"))
  )
    add("SENSITIVE", "WILDLIFE", "بيع كائن من الحياة الفطرية");

  if (REVIEW_RULES.vehicleRental && has(text, ["تاجير سيارات", "ايجار سيارات", "car rental"]))
    add("SENSITIVE", "VEHICLE_RENTAL", "عرض تأجير مركبات");

  return result;
}

export function parseReviewReasons(raw: string): RiskCode[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is RiskCode => typeof item === "string" && item in REASON_LABELS)
      : [];
  } catch {
    return [];
  }
}

export function parseReviewSignals(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string" && item.length <= 120)
          .slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

export function isLikelyDuplicate(
  proposed: { title: string; description: string; categoryId: string; price: number | null },
  recent: { title: string; description: string; categoryId: string; price: number | null }[],
): boolean {
  const title = normalize(proposed.title);
  const description = normalize(proposed.description);
  return recent.some(
    (row) =>
      row.categoryId === proposed.categoryId &&
      row.price === proposed.price &&
      title.length >= 8 &&
      title === normalize(row.title) &&
      (description === normalize(row.description) ||
        (description.length >= 80 &&
          description.slice(0, 80) === normalize(row.description).slice(0, 80))),
  );
}
