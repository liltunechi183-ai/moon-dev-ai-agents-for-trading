import { claimNextJob, completeJob, failJob } from "@/lib/jobs";
import { runCatchup } from "./catchup";
import { resolveChallengerNow } from "./gauntlet-runner";

const POLL_MS = 5000;

let running = false;

/** On-demand queue for the "speed up improvement" buttons. Separate queue so
 * a long resolve never blocks daily predictions. */
export function startImproveRunner(): void {
  setInterval(async () => {
    if (running) return;
    const job = claimNextJob(["cycle", "resolve"]);
    if (!job) return;
    running = true;
    try {
      if (job.type === "cycle") {
        await runCatchup(true); // force bypasses "already done today" guards
        completeJob(job.id, { ok: true });
      } else if (job.type === "resolve") {
        const result = await resolveChallengerNow();
        completeJob(job.id, result);
      }
    } catch (err) {
      failJob(job.id, err);
    } finally {
      running = false;
    }
  }, POLL_MS);
}
