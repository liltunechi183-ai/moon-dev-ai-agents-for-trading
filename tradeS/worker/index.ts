import "@/lib/load-env";

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
  const { startBacktestRunner } = await import("./backtest-runner");
  const { startTranslateRunner } = await import("./translate-runner");
  const { startGauntletRunner } = await import("./gauntlet-runner");
  const { startStrategistRunner } = await import("./strategist-runner");
  const { startCatchup } = await import("./catchup");
  const { startImproveRunner } = await import("./improve-runner");
  const { startDiscoveryRunner } = await import("./discovery-runner");
  const { startPrimerSaltoRunner } = await import("./primer-salto-runner");

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
  startPrimerSaltoRunner();
  startBacktestRunner();
  startTranslateRunner();
  startGauntletRunner();
  startStrategistRunner();
  startImproveRunner();
  startDiscoveryRunner();
  startCatchup();

  console.log("[worker] all runners started");
}

main().catch((err) => {
  console.error("[worker] fatal boot error:", err);
  process.exit(1);
});
