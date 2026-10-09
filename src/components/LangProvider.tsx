"use client";

import { createContext, useContext } from "react";
import type { Dictionary, Lang } from "@/lib/dict";

type LangValue = { lang: Lang; t: Dictionary };
const LangContext = createContext<LangValue | null>(null);

export function LangProvider({
  lang,
  dictionary,
  children,
}: {
  lang: Lang;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  return <LangContext.Provider value={{ lang, t: dictionary }}>{children}</LangContext.Provider>;
}

/** Client-side hook: current language + the selected dictionary. */
export function useLang() {
  const value = useContext(LangContext);
  if (!value) throw new Error("useLang must be used inside LangProvider");
  return value;
}
