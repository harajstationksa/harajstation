import { cookies } from "next/headers";
import { DICT, type Lang } from "./dict";

export type { Lang };
export { DICT };

export const LANG_COOKIE = "samel_lang";

/** UI language from cookie — Arabic-first, English fallback (spec). */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return value === "en" ? "en" : "ar";
}

/** Convenience: language + its dictionary in one call. */
export async function getT() {
  const lang = await getLang();
  return { lang, t: DICT[lang] };
}

/** Back-compat header/nav strings */
export const STR = {
  ar: DICT.ar.nav,
  en: DICT.en.nav,
} as const;
