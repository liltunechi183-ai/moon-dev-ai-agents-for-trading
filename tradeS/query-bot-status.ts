import Database from "better-sqlite3";
import { db, tables } from "@/lib/db";
import { eq } from "drizzle-orm";

function tradingDate(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

const today = tradingDate(Date.now());
const since = Date.now() - 36 * 3_600_000;

console.log(`\n=== Primer Salto Bot Status Report ===`);
console.log(`Today's trading date: ${today}`);
console.log(`Current time: ${new Date().toISOString()}`);

// 1. Get today's activity
console.log(`\n--- Today's Activity (Primer Salto) ---`);
const todayActivity = db
  .select({ ts: tables.botActivity.ts, decision: tables.botActivity.decision, reason: tables.botActivity.reason })
  .from(tables.botActivity)
  .where((t) => t.ts >= since && t.reason?.like?.("%[primer-salto]%"))
  .all() as Array<{ ts: number; decision: string; reason: string }>;

let foundToday = false;
for (const row of todayActivity) {
  const rowDate = tradingDate(row.ts);
  if (rowDate === today) {
    foundToday = true;
    const time = new Date(row.ts).toLocaleTimeString("en-US", { timeZone: "America/New_York" });
    console.log(`[${time}] ${row.decision.toUpperCase()}: ${row.reason}`);
  }
}

if (!foundToday) {
  console.log("No activity recorded for today yet");
}

// 2. Get open positions
console.log(`\n--- Open Positions (Primer Salto) ---`);
const openPos = db
  .select({
    id: tables.strategyPositions.id,
    symbol: tables.strategyPositions.symbol,
    entryDate: tables.strategyPositions.entryDate,
    entryPrice: tables.strategyPositions.entryPrice,
    stopPrice: tables.strategyPositions.stopPrice,
    targetPrice: tables.strategyPositions.targetPrice,
  })
  .from(tables.strategyPositions)
  .where((t) => t.strategy === "primer-salto" && t.status === "open")
  .all() as Array<{
    id: number;
    symbol: string;
    entryDate: string;
    entryPrice: number;
    stopPrice: number;
    targetPrice: number;
  }>;

if (openPos.length === 0) {
  console.log("No open positions");
} else {
  console.log(`${openPos.length} open position(s):`);
  for (const pos of openPos) {
    console.log(
      `  ${pos.symbol}: entry ${pos.entryPrice} (${pos.entryDate}), stop ${pos.stopPrice}, target ${pos.targetPrice}`
    );
  }
}

// 3. Get recent closed positions
console.log(`\n--- Recently Closed Positions (last 30 days) ---`);
const closedPos = db
  .select({
    symbol: tables.strategyPositions.symbol,
    entryDate: tables.strategyPositions.entryDate,
    entryPrice: tables.strategyPositions.entryPrice,
    entryTs: tables.strategyPositions.entryTs,
    closedTs: tables.strategyPositions.closedTs,
    closeReason: tables.strategyPositions.closeReason,
  })
  .from(tables.strategyPositions)
  .where(
    (t) =>
      t.strategy === "primer-salto" && t.status === "closed" && (t.closedTs ?? 0) >= Date.now() - 30 * 24 * 3_600_000
  )
  .all() as Array<{
    symbol: string;
    entryDate: string;
    entryPrice: number;
    entryTs: number;
    closedTs: number | null;
    closeReason: string | null;
  }>;

if (closedPos.length === 0) {
  console.log("No closed positions in the last 30 days");
} else {
  console.log(`${closedPos.length} closed position(s):`);
  for (const pos of closedPos) {
    const daysHeld = pos.closedTs ? Math.floor((pos.closedTs - pos.entryTs) / (24 * 3_600_000)) : 0;
    console.log(
      `  ${pos.symbol}: entry ${pos.entryDate} (${daysHeld} days held), closed: ${pos.closeReason || "unknown"}`
    );
  }
}

// 4. Get buy/sell decisions
console.log(`\n--- Trade Executions (all time, last 20) ---`);
const trades = db
  .select({ ts: tables.botActivity.ts, symbol: tables.botActivity.symbol, decision: tables.botActivity.decision, reason: tables.botActivity.reason })
  .from(tables.botActivity)
  .where((t) => t.reason?.like?.("%[primer-salto]%") && (t.decision === "buy" || t.decision === "sell"))
  .all() as Array<{ ts: number; symbol: string | null; decision: string; reason: string }>;

if (trades.length === 0) {
  console.log("No buy/sell decisions recorded");
} else {
  console.log(`${Math.min(trades.length, 20)} most recent buy/sell decision(s):`);
  for (const trade of trades.slice(0, 20)) {
    const dt = new Date(trade.ts).toLocaleString("en-US", { timeZone: "America/New_York" });
    console.log(`  [${dt}] ${trade.symbol} ${trade.decision.toUpperCase()}: ${trade.reason}`);
  }
}
