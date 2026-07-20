import cron from "node-cron";
import { claimNextJob, completeJob, enqueueJob, failJob } from "@/lib/jobs";
import { runSim, pickSimSymbol } from "@/lib/research/backtest";
import { deservesPostmortem } from "@/lib/research/postmortem";

const NIGHTLY_SIMS = 5;
const POLL_MS = 5000;

let running = false;

async function runAmbientSims(count = NIGHTLY_SIMS): Promise<number> {
  let done = 0;
  for (let i = 0; i < count; i++) {
    const symbol = pickSimSymbol();
    try {
      const row = await runSim(symbol);
      if (row) {
        done++;
        console.log(
          `[backtest-runner] ${symbol} sim: ${row.outlook} ${row.confidence}/10 → ${row.directionCorrect ? "✓" : "✗"} (${row.returnPct.toFixed(1)}%)`,
        );
        if (deservesPostmortem(row.directionCorrect, row.confidence)) {
          enqueueJob("postmortem", { source: "sim", backtestId: row.id });
        }
      }
    } catch (err) {
      console.error(`[backtest-runner] sim failed for ${symbol}:`, err);
    }
  }
  return done;
}

export function startBacktestRunner(): void {
  cron.schedule(
    "0 2 * * *",
    () => {
      if (running) return;
      running = true;
      runAmbientSims()
        .catch((err) => console.error("[backtest-runner] nightly failed:", err))
        .finally(() => (running = false));
    },
    { timezone: "America/New_York" },
  );

  // On-demand backtest jobs.
  setInterval(async () => {
    if (running) return;
    const job = claimNextJob(["backtest"]);
    if (!job) return;
    running = true;
    try {
      const { symbol, count } = job.payload as { symbol?: string; count?: number };
      let done = 0;
      if (symbol) {
        const row = await runSim(symbol.toUpperCase());
        done = row ? 1 : 0;
      } else {
        done = await runAmbientSims(count ?? NIGHTLY_SIMS);
      }
      completeJob(job.id, { sims: done });
    } catch (err) {
      failJob(job.id, err);
    } finally {
      running = false;
    }
  }, POLL_MS);
}

export { runAmbientSims };
