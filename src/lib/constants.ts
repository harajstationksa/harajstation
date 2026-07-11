export const CITIES = [
  "الرياض",
  "جدة",
  "مكة المكرمة",
  "المدينة المنورة",
  "الدمام",
  "الخبر",
  "الظهران",
  "الأحساء",
  "الطائف",
  "تبوك",
  "بريدة",
  "عنيزة",
  "حائل",
  "أبها",
  "خميس مشيط",
  "جازان",
  "نجران",
  "الباحة",
  "سكاكا",
  "عرعر",
  "ينبع",
  "الجبيل",
  "حفر الباطن",
  "القطيف",
  "الخرج",
] as const;

export const CONDITIONS = {
  NEW: "جديد",
  LIKE_NEW: "كالجديد",
  USED: "مستعمل",
} as const;

export type Condition = keyof typeof CONDITIONS;

export const LISTING_STATUS = {
  ACTIVE: "نشط",
  PENDING: "قيد المراجعة",
  SOLD: "تم البيع",
  EXPIRED: "منتهي",
  REMOVED: "محذوف",
} as const;

export const AUCTION_DURATIONS = [
  { hours: 24, label: "يوم واحد" },
  { hours: 72, label: "3 أيام" },
  { hours: 120, label: "5 أيام" },
  { hours: 168, label: "7 أيام" },
] as const;

export const TRUST_LEVELS = [
  { min: 81, label: "ممتاز", color: "#16a34a", stars: 5 },
  { min: 61, label: "موثوق", color: "#65a30d", stars: 4 },
  { min: 41, label: "متوسط", color: "#eab308", stars: 3 },
  { min: 21, label: "مبتدئ", color: "#db7759", stars: 2 },
  { min: 0, label: "غير موثوق", color: "#dc2626", stars: 1 },
] as const;

export const STAFF_ROLES = ["ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"];

export const ROLE_LABELS: Record<string, string> = {
  USER: "مستخدم",
  ADMIN: "مدير",
  MODERATOR: "مشرف",
  SUPPORT: "دعم فني",
  ACCOUNTANT: "محاسب",
};

// Credibility point rules (see spec §3)
export const CRED = {
  CONFIRMED_BOTH: 5,
  TIMEOUT_ONE_SIDE: -3,
  EXPIRED_BOTH: -5,
  DISPUTE_LOSER: -15,
  DISPUTE_WINNER: 5,
} as const;

export const CONFIRM_WINDOW_HOURS = 48;
export const SNIPE_WINDOW_MS = 2 * 60 * 1000; // last 2 minutes
export const SNIPE_EXTENSION_MS = 2 * 60 * 1000; // extend by 2 minutes

// Account limits
export const LIMITS = {
  FREE_LISTINGS: 10,
  FREE_AUCTIONS: 3,
  PRO_AUCTIONS: 10,
} as const;
