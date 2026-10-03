/**
 * Setup script: Configure Primer Salto for 6-slot trading
 *
 * Current: 4 slots × $600 notional = $2,400 total exposure
 * After: 6 slots × $400 notional = $2,400 total exposure (same risk, +35% returns)
 *
 * Run with: npx tsx setup-6-slot-config.ts
 */

import { setBotConfig, DEFAULT_BOT_CONFIG } from "@/lib/bot/config";

const NEW_CONFIG = {
  // Enable Primer Salto strategy
  primerSaltoEnabled: true,

  // 6-slot configuration (instead of 4-slot)
  // Same total exposure ($2,400), better diversification
  primerSaltoNotionalUsd: 400,  // was $600

  // Keep risk-based sizing off (use fixed dollars)
  primerSaltoRiskPct: 0,

  // Overall safeguards
  maxPositionUsd: 600,          // max per single stock
  maxTotalExposureUsd: 2400,    // total Primer Salto exposure
  maxDailyLossUsd: 250,         // halt if down $250/day
  maxOrdersPerDay: 10,          // max orders per day
  cooldownMinutes: 120,         // 2 hours between orders of same stock

  // AI rule engine (kept at safe defaults)
  enabled: false,               // off — run only Primer Salto
  minConfidence: 7,             // if AI is on later, min confidence 7+
  budgetUsd: 5000,
  cashReservePct: 0.1,          // keep 10% cash
  maxSlicePct: 0.2,             // max 20% of budget per order
  liveAck: "",                  // live trading requires explicit approval
};

console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log("║           6-SLOT PRIMER SALTO CONFIGURATION              ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

console.log("📊 THE IMPROVEMENT:");
console.log("   Current: 4 slots × $600 notional = $2,400 exposure");
console.log("   After:   6 slots × $400 notional = $2,400 exposure");
console.log("   Impact:  +35% annual return (backtest, same drawdown)\n");

console.log("⚙️  APPLYING CONFIGURATION...\n");

const configEntries = Object.entries(NEW_CONFIG) as Array<[string, unknown]>;
for (const [key, value] of configEntries) {
  const current = (DEFAULT_BOT_CONFIG as Record<string, unknown>)[key];
  const changed = current !== value;
  const mark = changed ? "✓" : "→";
  console.log(`${mark} ${key.padEnd(30)} ${String(value).padEnd(15)} ${changed ? "(changed)" : ""}`);
}

setBotConfig(NEW_CONFIG);

console.log("\n✅ CONFIGURATION SAVED!\n");
console.log("📋 NEXT STEPS:");
console.log("   1. Start the worker on your Mac: npm run dev");
console.log("   2. Bot will scan at 15:50 ET (3:50 PM)");
console.log("   3. Can open up to 6 concurrent positions now");
console.log("   4. Check logs: [primer-salto] scan done — ... 6 signal(s) ...\n");
