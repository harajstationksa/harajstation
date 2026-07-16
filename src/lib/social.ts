/**
 * Store social-media links: accept either a full profile URL or a bare
 * handle, normalize to a canonical https URL, and reject anything that
 * points outside the platform (an "instagram" link must live on
 * instagram.com — never a lookalike domain).
 */

export const SOCIAL_PLATFORMS = [
  "twitter",
  "instagram",
  "tiktok",
  "snapchat",
  "youtube",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

const PLATFORM_RULES: Record<
  SocialPlatform,
  { hosts: string[]; base: string }
> = {
  twitter: { hosts: ["x.com", "twitter.com"], base: "https://x.com/" },
  instagram: { hosts: ["instagram.com"], base: "https://instagram.com/" },
  tiktok: { hosts: ["tiktok.com"], base: "https://tiktok.com/@" },
  snapchat: { hosts: ["snapchat.com"], base: "https://snapchat.com/add/" },
  youtube: { hosts: ["youtube.com", "youtu.be"], base: "https://youtube.com/@" },
};

const HANDLE_RE = /^[\w.-]{1,60}$/;

function hostAllowed(host: string, allowed: string[]) {
  const h = host.toLowerCase().replace(/^www\./, "");
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

/**
 * Normalize one social field. Returns the canonical URL, null for an empty
 * value (= remove the link), or an Error message when the input is invalid.
 */
export function normalizeSocial(
  platform: SocialPlatform,
  raw: string | undefined | null
): string | null | { error: string } {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const rules = PLATFORM_RULES[platform];

  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { error: "رابط غير صالح" };
    }
    if (!hostAllowed(url.hostname, rules.hosts)) {
      return { error: `الرابط يجب أن يكون على ${rules.hosts[0]}` };
    }
    url.protocol = "https:";
    return url.toString();
  }

  // bare handle: "@my_store" or "my_store"
  const handle = value.replace(/^@/, "");
  if (!HANDLE_RE.test(handle)) {
    return { error: "اسم المستخدم يحتوي رموزاً غير مسموحة" };
  }
  return `${rules.base}${handle}`;
}

/** Website: any https URL (http is upgraded). */
export function normalizeWebsite(
  raw: string | undefined | null
): string | null | { error: string } {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { error: "رابط الموقع غير صالح" };
  }
  if (!/\./.test(url.hostname)) return { error: "رابط الموقع غير صالح" };
  url.protocol = "https:";
  return url.toString();
}

/** WhatsApp: international number, digits only (strip +, spaces, dashes). */
export function normalizeWhatsapp(
  raw: string | undefined | null
): string | null | { error: string } {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const digits = value.replace(/[\s+()-]/g, "");
  if (!/^\d{9,15}$/.test(digits)) {
    return { error: "رقم واتساب غير صالح — استخدم الصيغة الدولية مثل 9665xxxxxxxx" };
  }
  return digits;
}
