import "dotenv/config";

async function main() {
  // guardAnthropicKey() must run before anything AI-related is imported.
  const { env, guardAnthropicKey } = await import("@/lib/env");
  guardAnthropicKey();

  const { startPriceStream } = await import("./price-stream");
  const { startYahooPoller } = await import("./yahoo-poller");
  const { startSignalRunner } = await import("./signal-runner");
  const { startResearchRunner } = await import("./research-runner");
  const { startOutcomeRunner } = await import("./outcome-runner");
  const { startOrderSync, setFillSettledHandler } = await import("./order-sync");
  const { startBotRunner } = await import("./bot-runner");
  const { rebuildBotTrades } = await import("@/lib/bot/ledger");

  console.log(
    `[worker] booting — paper=${env.paper} hasAlpacaKeys=${env.hasAlpacaKeys} db=${env.databasePath}`,
  );

  startPriceStream();
  startYahooPoller();
  startSignalRunner();
  startResearchRunner();
  startOutcomeRunner();
  setFillSettledHandler(() => rebuildBotTrades());
  startOrderSync();
  startBotRunner();

  console.log("[worker] all runners started");
}

main().catch((err) => {
  console.error("[worker] fatal boot error:", err);
  process.exit(1);
});
