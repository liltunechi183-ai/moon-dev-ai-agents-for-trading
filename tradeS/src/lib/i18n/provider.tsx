"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SUPPORTED_LANGUAGES, BASE_LANGUAGE } from "./config";
import enCommon from "./dict/en/common.json";

type Dict = Record<string, string>;

// The base (en) dictionary ships statically; other languages load their
// files on demand and fall back key-by-key to en, then to the key itself,
// so a partial or missing dictionary degrades gracefully.
const BASE_DICT: Dict = { ...enCommon };

type TranslateVars = Record<string, string | number>;

interface I18nContextValue {
  lang: string;
  setLang: (code: string) => void;
  /** Looks up `key`; optional `vars` fill `{placeholders}` in the string. */
  t: (key: string, vars?: TranslateVars) => string;
}

function applyVars(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}

const I18nContext = createContext<I18nContextValue>({
  lang: BASE_LANGUAGE,
  setLang: () => {},
  t: (key, vars) => applyVars(BASE_DICT[key] ?? key, vars),
});

const STORAGE_KEY = "trades.lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState(BASE_LANGUAGE);
  const [dict, setDict] = useState<Dict>({});

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) {
      setLangState(stored);
    }
  }, []);

  useEffect(() => {
    if (lang === BASE_LANGUAGE) {
      setDict({});
      return;
    }
    // Load the language's dictionary areas; missing files just fall back.
    import(`./dict/${lang}/common.json`)
      .then((m: { default: Dict }) => setDict(m.default))
      .catch(() => setDict({}));
  }, [lang]);

  const setLang = useCallback((code: string) => {
    setLangState(code);
    localStorage.setItem(STORAGE_KEY, code);
  }, []);

  const t = useCallback(
    (key: string, vars?: TranslateVars) => applyVars(dict[key] ?? BASE_DICT[key] ?? key, vars),
    [dict],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
