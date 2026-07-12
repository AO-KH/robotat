import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { en, type Dictionary } from "./en";
import { ar } from "./ar";

export type Lang = "en" | "ar";
const DICTS: Record<Lang, Dictionary> = { en, ar };

interface I18nContextValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: (key: string, params?: Record<string, string | number>) => string;
  /** The full current-language dictionary, for structured content (arrays/objects). */
  dict: Dictionary;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Resolve a dotted key ("nav.home") against a nested dictionary. */
function resolve(dict: unknown, key: string): string {
  const val = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dict);
  return typeof val === "string" ? val : key;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("robotat-lang");
      if (saved === "en" || saved === "ar") return saved;
    } catch {
      /* ignore */
    }
    return "en";
  });

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem("robotat-lang", lang);
    } catch {
      /* ignore */
    }
  }, [lang, dir]);

  const t = (key: string, params?: Record<string, string | number>) => {
    let str = resolve(DICTS[lang], key);
    if (params) {
      for (const [k, v] of Object.entries(params)) str = str.replace(`{${k}}`, String(v));
    }
    return str;
  };

  return (
    <I18nContext.Provider value={{ lang, dir, t, dict: DICTS[lang], setLang }}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}
