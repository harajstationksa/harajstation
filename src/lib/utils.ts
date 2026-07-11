import { TRUST_LEVELS } from "./constants";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** "4,500 ر.س" — Latin digits, Arabic currency symbol (Haraj convention) */
export function formatSAR(amount: number) {
  return `${amount.toLocaleString("en-US")} ر.س`;
}

const rtfCache: Partial<Record<string, Intl.RelativeTimeFormat>> = {};

/** Locale-aware relative time: "قبل 3 ساعات" / "3 hours ago" */
export function timeAgo(date: Date | string, lang: "ar" | "en" = "ar") {
  const rtf = (rtfCache[lang] ??= new Intl.RelativeTimeFormat(lang, {
    numeric: "auto",
  }));
  const d = typeof date === "string" ? new Date(date) : date;
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.trunc(diffSec / 1), "second");
  if (abs < 3600) return rtf.format(Math.trunc(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.trunc(diffSec / 3600), "hour");
  if (abs < 2592000) return rtf.format(Math.trunc(diffSec / 86400), "day");
  return rtf.format(Math.trunc(diffSec / 2592000), "month");
}

export function formatDate(date: Date | string, lang: "ar" | "en" = "ar") {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Deterministic masked bidder name per (user, auction): "حراج_482" */
export function maskedBidderName(userId: string, auctionId: string) {
  let h = 0;
  const s = userId + auctionId;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  const n = (Math.abs(h) % 900) + 100;
  return `حراج_${n}`;
}

export function parseImages(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function trustLevel(score: number) {
  return TRUST_LEVELS.find((l) => score >= l.min) ?? TRUST_LEVELS[4];
}

/** Remaining time parts for countdowns (server-side rendering) */
export function timeParts(msLeft: number) {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export function two(n: number) {
  return n.toString().padStart(2, "0");
}

/** Accepts 05XXXXXXXX / 5XXXXXXXX / +9665XXXXXXXX → canonical +9665XXXXXXXX */
export function normalizeSaudiPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "");
  const m = digits.match(/^(?:\+?966|0)?(5\d{8})$/);
  return m ? `+966${m[1]}` : null;
}

/**
 * A display name must contain at least two real letters (Arabic or Latin).
 * Rejects names that arrive as "??????" after a broken-encoding round-trip
 * (mojibake) or as pure symbols/digits.
 */
export function isValidDisplayName(name: string): boolean {
  const letters = name.match(/\p{L}/gu);
  return !!letters && letters.length >= 2 && !name.includes("�");
}
