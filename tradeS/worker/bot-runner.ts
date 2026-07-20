import cron from "node-cron";
import { runBotTick } from "@/lib/bot/engine";

export function startBotRunner(): void {
  cron.schedule(
    "*/5 9-16 * * 1-5",
    () => {
      runBotTick().catch((err) => console.error("[bot-runner] tick failed:", err));
    },
    { timezone: "America/New_York" },
  );
}
