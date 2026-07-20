import { NextResponse } from "next/server";
import { z } from "zod";
import { getCachedTranslation } from "@/lib/i18n/translate";
import { SUPPORTED_LANGUAGES, BASE_LANGUAGE } from "@/lib/i18n/config";
import { enqueueJob } from "@/lib/jobs";

const schema = z.object({
  lang: z.string().min(2).max(10),
  text: z.string().min(1).max(8000),
});

/**
 * Display-only translation cache. Cache hit → the translation; miss → a
 * translate job is enqueued (the WORKER runs the model — never inline
 * here) and the client polls by re-posting.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const { lang, text } = parsed.data;

  if (lang === BASE_LANGUAGE) return NextResponse.json({ translatedText: text });
  if (!SUPPORTED_LANGUAGES.some((l) => l.code === lang)) {
    return NextResponse.json({ error: "unsupported language" }, { status: 400 });
  }

  const cached = getCachedTranslation(lang, text);
  if (cached !== null) return NextResponse.json({ translatedText: cached });

  const job = enqueueJob("translate", { lang, text });
  return NextResponse.json({ pending: true, jobId: job.id }, { status: 202 });
}
