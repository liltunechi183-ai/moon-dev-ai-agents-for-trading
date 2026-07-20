import cron from "node-cron";
import { runStrategist } from "@/lib/improve/strategist-run";
import { runRuleAdvisor } from "@/lib/improve/rule-advisor";

/** Weekly, Sunday ET. 19:30 → rule advisor; 20:00 → strategist. Both skip
 * loudly (their gates log the reason) when the evidence is thin. */
export function startStrategistRunner(): void {
  cron.schedule(
    "30 19 * * 0",
    () => {
      runRuleAdvisor()
        .then((r) => console.log(`[rule-advisor] created ${r.suggestionsCreated} suggestion(s)`))
        .catch((err) => console.error("[rule-advisor] failed:", err));
    },
    { timezone: "America/New_York" },
  );

  cron.schedule(
    "0 20 * * 0",
    () => {
      runStrategist()
        .then((r) => console.log(`[strategist] ${r.proposed ? "proposed" : "skipped"}: ${r.reason}`))
        .catch((err) => console.error("[strategist] failed:", err));
    },
    { timezone: "America/New_York" },
  );
}
