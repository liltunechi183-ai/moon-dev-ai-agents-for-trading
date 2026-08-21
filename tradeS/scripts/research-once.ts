// One research run from the terminal: `npx tsx scripts/research-once.ts AAPL`
import "../src/lib/load-env";

async function main() {
  const symbol = process.argv[2]?.toUpperCase();
  if (!symbol) {
    console.error("usage: tsx scripts/research-once.ts SYMBOL");
    process.exit(1);
  }

  const { guardAnthropicKey } = await import("../src/lib/env");
  guardAnthropicKey();

  const { seedStrategies } = await import("../src/lib/research/strategy");
  seedStrategies();

  const { research } = await import("../src/lib/research/agent");
  console.log(`[research-once] researching ${symbol}…`);
  const row = await research(symbol);

  if (row.status === "ok") {
    console.log(`\n${symbol}: ${row.outlook} ${row.confidence}/10, horizon ${row.horizonDays}d`);
    console.log(`\nThesis:\n${row.thesis}`);
    console.log(`\nRisks:\n${row.risks.map((r) => `- ${r}`).join("\n")}`);
    if (row.catalysts.length) console.log(`\nCatalysts:\n${row.catalysts.map((c) => `- ${c}`).join("\n")}`);
    if (row.sources.length) {
      console.log(`\nSources:\n${row.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}`);
    }
    console.log(`\n(model ${row.model}, ${Math.round((row.durationMs ?? 0) / 1000)}s, strategy v${row.algoVersion})`);
  } else {
    console.error(`analysis failed; raw answer:\n${row.raw}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
