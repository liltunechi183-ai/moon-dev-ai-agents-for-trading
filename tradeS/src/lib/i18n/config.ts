/**
 * The single source of truth for languages. The FIRST entry is the base
 * language (English) — the AI always writes in it, and every stored string
 * is in it. To add a language: append `{ code, label }` here and create
 * `src/lib/i18n/dict/<code>/` (copy the en files and translate — gaps fall
 * back to en). Machine text (theses, lessons, reasons) translates itself
 * on demand via the translations cache. Nothing else in the app hardcodes
 * a language.
 */
export const SUPPORTED_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "EN" },
];

export const BASE_LANGUAGE = SUPPORTED_LANGUAGES[0].code;
