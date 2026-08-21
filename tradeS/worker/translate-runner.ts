import { claimNextJob, completeJob, failJob } from "@/lib/jobs";
import { runAnalysis } from "@/lib/research/agent";
import { storeTranslation, getCachedTranslation } from "@/lib/i18n/translate";
import { FAST_MODEL } from "@/lib/models";

const TRANSLATE_MODEL = FAST_MODEL;
const POLL_MS = 5000;

let busy = false;

/** Own poll loop so quick translations never queue behind long research. */
export function startTranslateRunner(): void {
  setInterval(async () => {
    if (busy) return;
    const job = claimNextJob(["translate"]);
    if (!job) return;
    busy = true;
    try {
      const { lang, text } = job.payload as { lang: string; text: string };
      const cached = getCachedTranslation(lang, text);
      if (cached !== null) {
        completeJob(job.id, { translatedText: cached });
        return;
      }
      const run = await runAnalysis(
        `Translate the following text into the language with code "${lang}".
Keep the tone simple (grade 6-7 reading level). Output ONLY the
translation, nothing else.

${text}`,
        {
          systemPrompt: "You are a precise translator. Output only the translation.",
          model: TRANSLATE_MODEL,
          allowedTools: [],
          maxTurns: 1,
        },
      );
      const translated = run.resultText.trim();
      storeTranslation(lang, text, translated);
      completeJob(job.id, { translatedText: translated });
    } catch (err) {
      failJob(job.id, err);
    } finally {
      busy = false;
    }
  }, POLL_MS);
}
