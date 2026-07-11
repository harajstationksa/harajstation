"use client";

import { createContext, useContext } from "react";
import { DICT, type Lang } from "@/lib/dict";

const LangContext = createContext<Lang>("ar");

export function LangProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** Client-side hook: current language + dictionary. */
export function useLang() {
  const lang = useContext(LangContext);
  return { lang, t: DICT[lang] };
}
