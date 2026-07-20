import cron from "node-cron";
import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { getTestingVersion, getActiveStrategy } from "@/lib/research/strategy";
import { fetchSimBars, pickAsOfIndex, runSimAtIndex } from "@/lib/research/backtest";
import { pickSimSymbol } from "@/lib/research/backtest";
import { overlapsLessonWindow, type LessonWindow } from "@/lib/improve/gauntlet";
import { evaluateChallenger, checkRollback } from "@/lib/improve/controller";

const PAIRS_PER_NIGHT = 3;
const MAX_TRIES_PER_PAIR = 8;

function loadLessonWindows(challengerVersion: number): LessonWindow[] {
  // Lessons the challenger's parent line was derived from: use all lessons
  // as the holdout (the strategist reads clusters across the whole set).
  const lessons = db.select().from(tables.lessons).all();
  const windows: LessonWindow[] = [];
  for (const l of lessons) {
    if (l.backtestId != null) {
      const [b] = db.select().from(tables.backtests).where(eq(tables.backtests.id, l.backtestId)).limit(1).all();
      if (b) windows.push({ symbol: b.symbol, asOf: b.asOf, horizonDays: b.horizonDays });
    } else if (l.predictionId != null) {
      const [p] = db.select().from(tables.predictions).where(eq(tables.predictions.id, l.predictionId)).limit(1).all();
      if (p) windows.push({ symbol: p.symbol, asOf: p.createdAt, horizonDays: p.horizonDays });
    }
  }
  void challengerVersion;
  return windows;
}

/** Run one paired champion-vs-challenger sim on an identical (symbol, date)
 * that does NOT overlap a lesson window. Returns true if a pair was run. */
async function runOnePair(lessonWindows: LessonWindow[]): Promise<boolean> {
  const challenger = getTestingVersion();
  if (!challenger || challenger.tier === "full") return false; // full-tier uses shadows, not sims
  const champion = getActiveStrategy();

  for (let attempt = 0; attempt < MAX_TRIES_PER_PAIR; attempt++) {
    const symbol = pickSimSymbol();
    let bars;
    try {
      bars = await fetchSimBars(symbol);
    } catch {
      continue;
    }
    const asOfIdx = pickAsOfIndex(bars);
    if (asOfIdx === null) continue;
    const asOf = bars[asOfIdx].ts;

    // Use the challenger's max horizon (90d) as a conservative window for the
    // holdout check; skip if it overlaps a lesson the challenger studied.
    if (overlapsLessonWindow({ symbol, asOf, horizonDays: 90 }, lessonWindows)) continue;

    try {
      await runSimAtIndex(symbol, bars, asOfIdx, { strategy: champion });
      await runSimAtIndex(symbol, bars, asOfIdx, { strategy: challenger });
      return true;
    } catch (err) {
      console.error(`[gauntlet] paired sim failed for ${symbol}:`, err);
      return false;
    }
  }
  return false;
}

export async function runGauntlet(pairs = PAIRS_PER_NIGHT): Promise<number> {
  const challenger = getTestingVersion();
  if (!challenger) {
    console.log("[gauntlet] no challenger in testing — skipping");
    return 0;
  }
  const lessonWindows = loadLessonWindows(challenger.version);
  let ran = 0;
  for (let i = 0; i < pairs; i++) {
    if (await runOnePair(lessonWindows)) ran++;
  }
  if (ran > 0) console.log(`[gauntlet] ran ${ran} paired sim(s) for v${challenger.version}`);
  return ran;
}

/** On-demand "resolve now": run pairs in a tight loop until the challenger
 * has enough samples or we hit the cap, then evaluate + rollback-check. */
export async function resolveChallengerNow(maxBatches = 20): Promise<{ evaluated: boolean; promoted: boolean; reason: string }> {
  const challenger = getTestingVersion();
  if (!challenger) return { evaluated: false, promoted: false, reason: "no challenger in testing" };

  for (let batch = 0; batch < maxBatches; batch++) {
    await runGauntlet(3);
    const evalResult = evaluateChallenger();
    if (evalResult && (evalResult.promoted || evalResult.scorecard.enoughSamples)) {
      checkRollback();
      return {
        evaluated: true,
        promoted: evalResult.promoted,
        reason: evalResult.reason,
      };
    }
    if (!getTestingVersion()) break; // promoted/removed mid-loop
  }
  const final = evaluateChallenger();
  checkRollback();
  return {
    evaluated: Boolean(final),
    promoted: final?.promoted ?? false,
    reason: final?.reason ?? "not enough samples after resolving",
  };
}

export function startGauntletRunner(): void {
  cron.schedule(
    "0 3 * * *",
    () => {
      runGauntlet()
        .then(() => {
          evaluateChallenger();
          checkRollback();
        })
        .catch((err) => console.error("[gauntlet-runner] nightly failed:", err));
    },
    { timezone: "America/New_York" },
  );
}
