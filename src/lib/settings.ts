import { db } from "./db";

/** Admin-tunable global settings with safe numeric fallbacks. */
const DEFAULTS: Record<string, string> = {
  POINTS_PER_VISITOR: "3",
  FEATURE_POINT_COST: "100",
  // day-based campaigns: cost per day + quick-pick day suggestions (users may
  // also type any custom duration) — both editable from /admin/points at any time
  CAMPAIGN_POINTS_PER_DAY: "50",
  CAMPAIGN_DAY_OPTIONS: "3,5,7,15,30",
  // footer social links — admin-editable from /admin/banners ("" = link disabled)
  SOCIAL_INSTAGRAM: "",
  SOCIAL_FACEBOOK: "",
  SOCIAL_SNAPCHAT: "",
  // «تواصل معنا» page — admin-editable from /admin/banners
  CONTACT_EMAIL: "support@harajstation.com",
  CONTACT_PHONE: "920000000",
  CONTACT_WHATSAPP: "+966 50 000 0000",
  CONTACT_HOURS: "الأحد – الخميس، 9 صباحاً – 6 مساءً (توقيت السعودية)",
};

/** Parsed, sanitized campaign day options (admin-editable CSV). */
export async function getCampaignDayOptions(): Promise<number[]> {
  const raw = await getSetting("CAMPAIGN_DAY_OPTIONS");
  const days = raw
    .split(/[,\s]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 365);
  return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : [3, 5, 7, 15, 30];
}

export async function getSetting(key: string): Promise<string> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? "";
}

export async function getSettingInt(key: string, fallback = 0): Promise<number> {
  const raw = await getSetting(key);
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function setSetting(key: string, value: string) {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function allSettings() {
  const rows = await db.setting.findMany();
  const map = { ...DEFAULTS } as Record<string, string>;
  for (const r of rows) map[r.key] = r.value;
  return map;
}
