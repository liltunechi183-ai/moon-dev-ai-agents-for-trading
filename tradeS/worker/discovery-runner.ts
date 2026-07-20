import cron from "node-cron";
import { claimNextJob, completeJob, failJob } from "@/lib/jobs";
import { runDiscoveryScan } from "@/lib/discovery/hunter";

const POLL_MS = 5000;

// One shared flag covers the cron and the on-demand poll path so two scans
// can't run at once.
let running = false;

async function scanGuarded(): Promise<{ scanId: number; inserted: number } | null> {
  if (running) return null;
  running = true;
  try {
    return await runDiscoveryScan();
  } finally {
    running = false;
  }
}

/**
 * Weekly dark-horse scan, Saturday 10:00 ET (weekend = idle agent budget, a
 * day before the strategist's Sunday slots, early enough that approved picks
 * are on the watchlist before Monday's 7:00 sweep, and Friday's close is a
 * stable priceAtDiscovery). Plus its OWN 5s poll loop for on-demand scans —
 * NOT piggybacked on improve-runner, whose single running flag would queue a
 * Scan-now click behind a 10-20 minute cycle/resolve run.
 */
export function startDiscoveryRunner(): void {
  cron.schedule(
    "0 10 * * 6",
    () => {
      scanGuarded().catch((err) => console.error("[discovery-runner] weekly scan failed:", err));
    },
    { timezone: "America/New_York" },
  );

  setInterval(async () => {
    if (running) return;
    const job = claimNextJob(["discovery"]);
    if (!job) return;
    try {
      const result = await scanGuarded();
      completeJob(job.id, result ?? { skipped: "a scan was already running" });
    } catch (err) {
      failJob(job.id, err);
    }
  }, POLL_MS);
}
