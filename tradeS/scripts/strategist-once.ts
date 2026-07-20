// Run the strategist once from the terminal: `npx tsx scripts/strategist-once.ts`
import "dotenv/config";

async function main() {
  const { guardAnthropicKey } = await import("../src/lib/env");
  guardAnthropicKey();
  const { seedStrategies } = await import("../src/lib/research/strategy");
  seedStrategies();
  const { runStrategist } = await import("../src/lib/improve/strategist-run");

  console.log("[strategist-once] running…");
  const result = await runStrategist();
  console.log(result.proposed ? `Proposed v${result.version}: ${result.reason}` : `Skipped: ${result.reason}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
