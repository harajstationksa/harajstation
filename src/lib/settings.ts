import { db } from "./db";

/** Admin-tunable global settings with safe numeric fallbacks. */
const DEFAULTS: Record<string, string> = {
  POINTS_PER_VISITOR: "3",
  FEATURE_POINT_COST: "100",
  // «تجديد» (bump): lifts a listing back to the top of the feed — free once
  // every BUMP_FREE_HOURS, costs points when renewed sooner
  BUMP_POINT_COST: "15",
  BUMP_FREE_HOURS: "48",
  // day-based campaigns: cost per day + quick-pick day suggestions (users may
  // also type any custom duration) — both editable from /admin/points at any time
  CAMPAIGN_POINTS_PER_DAY: "50",
  CAMPAIGN_DAY_OPTIONS: "3,5,7,15,30",
  // footer social links — admin-editable from /admin/banners ("" = link disabled)
  SOCIAL_INSTAGRAM: "",
  SOCIAL_FACEBOOK: "",
  SOCIAL_SNAPCHAT: "",
  // free-tier launch promo — admin-editable from /admin/plans: every new
  // signup gets PRO for FREE_TIER_DAYS days while the switch is on
  FREE_TIER_ENABLED: "0",
  FREE_TIER_DAYS: "30",
  // referral program — admin-editable from /admin/promos: the referrer earns
  // REFERRAL_PERCENT% of every points purchase their invitee completes
  REFERRAL_ENABLED: "1",
  REFERRAL_PERCENT: "10",
  // homepage stats strip (active ads / live auctions / trusted users) —
  // admin can hide it from /admin/banners
  HOME_STATS_VISIBLE: "1",
  // point top-ups — admin can pause purchases from /admin/points; users then
  // see TOPUP_DISABLED_MESSAGE instead of the package grid ("" = default text)
  TOPUP_ENABLED: "1",
  TOPUP_DISABLED_MESSAGE: "",
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

/**
 * Point top-ups: purchases can be paused from /admin/points (e.g. before the
 * payment gateway goes live). Every purchase surface (wallet page, wallet
 * server action, mobile API) must consult this so a paused shop can't be
 * bypassed by posting the form directly.
 */
export async function getTopupConfig(): Promise<{
  enabled: boolean;
  message: string;
}> {
  const [enabled, message] = await Promise.all([
    getSetting("TOPUP_ENABLED"),
    getSetting("TOPUP_DISABLED_MESSAGE"),
  ]);
  return {
    enabled:
      enabled !== "0" &&
      process.env.PAYMENTS_ENABLED === "true" &&
      !!process.env.MOYASAR_SECRET_KEY,
    message: message.trim() || "شحن النقاط غير متاح حالياً — سيتم تفعيله قريباً.",
  };
}

/** Launch promo: free PRO for every new signup while the admin switch is on. */
export async function getFreeTierConfig(): Promise<{
  enabled: boolean;
  days: number;
}> {
  const [enabled, daysRaw] = await Promise.all([
    getSetting("FREE_TIER_ENABLED"),
    getSetting("FREE_TIER_DAYS"),
  ]);
  const days = parseInt(daysRaw, 10);
  return {
    enabled: enabled === "1",
    days: Number.isInteger(days) && days >= 1 && days <= 365 ? days : 30,
  };
}

/** Read current settings from the shared database; no per-worker stale values. */
async function settingsMap(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany();
  const map = { ...DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function getSetting(key: string): Promise<string> {
  return (await db.setting.findUnique({ where: { key } }))?.value ?? DEFAULTS[key] ?? "";
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
  return { ...(await settingsMap()) };
}
