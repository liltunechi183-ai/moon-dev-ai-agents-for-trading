import { gte } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { sweepResearch } from "./research-runner";
import { runAmbientSims } from "./backtest-runner";
import { runGauntlet } from "./gauntlet-runner";
import { evaluateChallenger, checkRollback } from "@/lib/improve/controller";
import { runStrategist } from "@/lib/improve/strategist-run";
import { runRuleAdvisor } from "@/lib/improve/rule-advisor";
import { getTestingVersion } from "@/lib/research/strategy";

const DAY_MS = 86_400_000;

function simsToday(): number {
  const dayStart = Date.now() - DAY_MS;
  return db.select({ id: tables.backtests.id }).from(tables.backtests).where(gte(tables.backtests.createdAt, dayStart)).all().length;
}

function strategyVersionTouchedRecently(sinceDays: number): boolean {
  const since = Date.now() - sinceDays * DAY_MS;
  return (
    db
      .select({ version: tables.strategyVersions.version })
      .from(tables.strategyVersions)
      .where(gte(tables.strategyVersions.createdAt, since))
      .all().length > 0
  );
}

/**
 * Because the machine is a laptop that sleeps, derive (from existing data,
 * no marker table, idempotent) what the cron schedule missed and run it now.
 * `force` bypasses the "already done today" guards but NEVER the real
 * prerequisite gates.
 */
export async function runCatchup(force = false): Promise<void> {
  console.log(`[catchup] running (force=${force})`);

  // 1. Research sweep for any symbol lacking a fresh prediction.
  try {
    sweepResearch();
  } catch (err) {
    console.error("[catchup] research sweep failed:", err);
  }

  // 2. Ambient sims if we haven't run enough today.
  if (force || simsToday() < 5) {
    await runAmbientSims(5).catch((err) => console.error("[catchup] sims failed:", err));
  }

  // 3. Gauntlet + eval + rollback if a challenger is testing.
  if (getTestingVersion()) {
    await runGauntlet().catch((err) => console.error("[catchup] gauntlet failed:", err));
    try {
      evaluateChallenger();
      checkRollback();
    } catch (err) {
      console.error("[catchup] eval/rollback failed:", err);
    }
  }

  // 4. Weekly advisor + strategist if a week has passed since the last one.
  const strategistRecentlyRan = strategyVersionTouchedRecently(6);
  if (force || !strategistRecentlyRan) {
    await runRuleAdvisor().catch((err) => console.error("[catchup] rule advisor failed:", err));
    await runStrategist().catch((err) => console.error("[catchup] strategist failed:", err));
  }

  // 5. Weekly discovery scan is added in Phase 7; deliberately NOT
  //    force-bypassed there.

  console.log("[catchup] done");
}

export function startCatchup(): void {
  setTimeout(() => {
    runCatchup(false).catch((err) => console.error("[catchup] boot run failed:", err));
  }, 90_000);
}
