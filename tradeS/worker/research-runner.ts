import cron from "node-cron";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { claimNextJob, completeJob, enqueueJob, failJob, requeueStaleJobs, type JobRow } from "@/lib/jobs";
import { getTrackedSymbols } from "@/lib/tracked";
import { seedStrategies } from "@/lib/research/strategy";
import { research } from "@/lib/research/agent";

const POLL_MS = 5000;
const FRESH_PREDICTION_MS = 20 * 60 * 60_000; // <20h counts as fresh

// Strict priority order. Later phases add handlers (chat, postmortem,
// relations) and add them to HANDLED; unhandled types are never claimed.
const PRIORITY: Array<"chat" | "research" | "postmortem" | "relations"> = [
  "chat",
  "research",
  "postmortem",
  "relations",
];
const HANDLED = new Set<string>(["chat", "research", "postmortem"]);

let busy = false;

async function handleJob(job: JobRow): Promise<void> {
  if (job.type === "chat") {
    const { predictionId } = job.payload as { predictionId: number };
    const { runChallenge } = await import("@/lib/research/challenge");
    const result = await runChallenge(predictionId);
    completeJob(job.id, result);
    return;
  }
  if (job.type === "research") {
    const { symbol } = job.payload as { symbol: string };
    console.log(`[research-runner] researching ${symbol} (job ${job.id})`);
    const row = await research(symbol);
    console.log(
      `[research-runner] ${symbol}: ${row.status === "ok" ? `${row.outlook} ${row.confidence}/10` : "ERROR"} in ${Math.round((row.durationMs ?? 0) / 1000)}s`,
    );
    completeJob(job.id, { predictionId: row.id, status: row.status });
    return;
  }
  if (job.type === "postmortem") {
    await handlePostmortem(job);
    return;
  }
  // A queued job type this phase can't handle yet — fail it loudly rather
  // than looping on it forever.
  failJob(job.id, `no handler for job type "${job.type}" in this build`);
}

async function handlePostmortem(job: JobRow): Promise<void> {
  const payload = job.payload as { source: "live" | "sim"; predictionId?: number; backtestId?: number };
  const { runPostmortem } = await import("@/lib/research/postmortem");
  const { quantSummaryFor } = await import("./outcome-runner");

  if (payload.source === "live" && payload.predictionId != null) {
    const [p] = db
      .select()
      .from(tables.predictions)
      .where(eq(tables.predictions.id, payload.predictionId))
      .limit(1)
      .all();
    const [o] = p
      ? db
          .select()
          .from(tables.predictionOutcomes)
          .where(eq(tables.predictionOutcomes.predictionId, payload.predictionId))
          .limit(1)
          .all()
      : [];
    if (!p || !o) {
      completeJob(job.id, { skipped: "prediction or outcome missing" });
      return;
    }
    await runPostmortem({
      source: "live",
      predictionId: p.id,
      symbol: p.symbol,
      regime: p.regime,
      algoVersion: p.algoVersion,
      outlook: p.outlook,
      confidence: p.confidence,
      returnPct: o.returnPct,
      directionCorrect: o.directionCorrect,
      thesis: p.thesis,
      risks: p.risks,
      quantSummary: quantSummaryFor(p.quantSnapshot),
    });
    completeJob(job.id, { ok: true });
    return;
  }

  if (payload.source === "sim" && payload.backtestId != null) {
    const [b] = db
      .select()
      .from(tables.backtests)
      .where(eq(tables.backtests.id, payload.backtestId))
      .limit(1)
      .all();
    if (!b) {
      completeJob(job.id, { skipped: "backtest missing" });
      return;
    }
    await runPostmortem({
      source: "sim",
      backtestId: b.id,
      symbol: b.symbol,
      regime: b.regime,
      algoVersion: b.algoVersion,
      outlook: b.outlook,
      confidence: b.confidence,
      returnPct: b.returnPct,
      directionCorrect: b.directionCorrect,
      thesis: b.thesis,
      quantSummary: quantSummaryFor(b.quantSnapshot),
    });
    completeJob(job.id, { ok: true });
    return;
  }

  completeJob(job.id, { skipped: "bad postmortem payload" });
}

async function pollOnce(): Promise<void> {
  if (busy) return;
  const job = claimNextJob(PRIORITY.filter((t) => HANDLED.has(t)));
  if (!job) return;
  busy = true;
  try {
    await handleJob(job);
  } catch (err) {
    console.error(`[research-runner] job ${job.id} failed:`, err);
    failJob(job.id, err);
  } finally {
    busy = false;
  }
}

function hasFreshPrediction(symbol: string): boolean {
  const [latest] = db
    .select({ createdAt: tables.predictions.createdAt })
    .from(tables.predictions)
    .where(eq(tables.predictions.symbol, symbol))
    .orderBy(desc(tables.predictions.createdAt))
    .limit(1)
    .all();
  return latest !== undefined && Date.now() - latest.createdAt < FRESH_PREDICTION_MS;
}

export function sweepResearch(): number {
  const symbols = getTrackedSymbols();
  let enqueued = 0;
  for (const symbol of symbols) {
    if (hasFreshPrediction(symbol)) continue;
    enqueueJob("research", { symbol });
    enqueued++;
  }
  if (enqueued > 0) console.log(`[research-runner] sweep enqueued ${enqueued} research job(s)`);
  return enqueued;
}

export function startResearchRunner(): void {
  seedStrategies();

  setInterval(() => {
    pollOnce().catch((err) => console.error("[research-runner] poll failed:", err));
  }, POLL_MS);

  // Daily 7am ET sweep: research every tracked symbol lacking a fresh call.
  cron.schedule("0 7 * * 1-5", () => sweepResearch(), { timezone: "America/New_York" });

  // Heal jobs orphaned by a worker restart.
  cron.schedule("0 * * * *", () => requeueStaleJobs());
  setTimeout(() => requeueStaleJobs(), 20_000);
}
