"use client";

import { createContext, useContext } from "react";
import { DICT, type Lang } from "@/lib/dict";

const LangContext = createContext<Lang>("ar");

/**
 * Only the language crosses the server/client boundary. The dictionary holds
 * formatter functions (e.g. `bonusGift(n)`), which React cannot serialize as
 * props — passing it from the server layout made every page fail to render.
 */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** Client-side hook: current language + dictionary. */
export function useLang() {
  const lang = useContext(LangContext);
  return { lang, t: DICT[lang] };
}
