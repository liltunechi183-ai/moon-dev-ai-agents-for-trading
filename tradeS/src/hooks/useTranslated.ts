"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { BASE_LANGUAGE } from "@/lib/i18n/config";

/**
 * Display-only machine-text translation. In the base language (or while
 * the cache is warming), the English source renders directly; once the
 * worker fills the cache, the translation appears.
 */
export function useTranslated(sourceText: string | null | undefined): string {
  const { lang } = useI18n();
  const [translated, setTranslated] = useState<string | null>(null);

  useEffect(() => {
    setTranslated(null);
    if (!sourceText || lang === BASE_LANGUAGE) return;
    let cancelled = false;

    async function fetchTranslation(retriesLeft: number) {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, text: sourceText }),
      });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (data.translatedText) {
        if (!cancelled) setTranslated(data.translatedText);
      } else if (data.pending && retriesLeft > 0 && !cancelled) {
        setTimeout(() => fetchTranslation(retriesLeft - 1), 4000);
      }
    }
    fetchTranslation(5);
    return () => {
      cancelled = true;
    };
  }, [sourceText, lang]);

  return translated ?? sourceText ?? "";
}
