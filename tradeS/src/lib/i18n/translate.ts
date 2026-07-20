import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { BASE_LANGUAGE } from "./config";

export function translationHash(lang: string, sourceText: string): string {
  return createHash("sha256").update(`${lang}\n${sourceText}`).digest("hex");
}

export function getCachedTranslation(lang: string, sourceText: string): string | null {
  if (lang === BASE_LANGUAGE) return sourceText;
  const [row] = db
    .select()
    .from(tables.translations)
    .where(eq(tables.translations.hash, translationHash(lang, sourceText)))
    .limit(1)
    .all();
  return row?.translatedText ?? null;
}

export function storeTranslation(lang: string, sourceText: string, translatedText: string): void {
  db.insert(tables.translations)
    .values({
      hash: translationHash(lang, sourceText),
      lang,
      sourceText,
      translatedText,
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .run();
}
