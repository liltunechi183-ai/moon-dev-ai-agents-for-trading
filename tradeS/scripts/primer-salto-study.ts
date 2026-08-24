// Which symbols does the "Primer Salto" checklist actually fit?
//
//   npx tsx scripts/primer-salto-study.ts
//   npx tsx scripts/primer-salto-study.ts --loose      # exhaustion rule off
//   npx tsx scripts/primer-salto-study.ts --symbols AAPL,MSFT,NVDA
//   npx tsx scripts/primer-salto-study.ts --split 2021-01-01
//
// The whole point is the in-sample / out-of-sample split. Ranking 60 symbols
// and keeping the best is a machine for manufacturing luck: with enough
// candidates, some look excellent by chance alone. So every symbol is ranked
// ONLY on the training window, and then shown on a later window the ranking
// never touched. A symbol that shines in one and collapses in the other was
// noise. That contrast is the actual output — not the leaderboard.
//
// Reads nothing from the app's database and places no orders. Educational
// analysis of historical data, not financial advice.
import { writeFileSync } from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";
import {
  DEFAULT_PARAMS,
  simulate,
  summarize,
  tradesInWindow,
  stayedProfitable,
  type PrimerSaltoParams,
  type Stats,
  type Trade,
} from "../src/lib/study/primer-salto";
import type { Bar } from "../src/lib/quant/types";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/** Liquid US names with a full history back to 2011, spread across sectors so
 * the result is not just one industry's decade. */
const UNIVERSE = [
  // Mega-cap tech
  "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "ADBE", "CRM", "ORCL", "CSCO",
  "INTC", "AMD", "QCOM", "TXN", "AVGO", "MU", "AMAT", "IBM",
  // Financials
  "JPM", "BAC", "WFC", "GS", "MS", "C", "AXP", "SCHW", "BLK", "V", "MA",
  // Healthcare
  "JNJ", "PFE", "MRK", "ABBV", "UNH", "LLY", "TMO", "ABT", "BMY", "AMGN",
  // Consumer
  "WMT", "COST", "HD", "MCD", "NKE", "SBUX", "TGT", "LOW", "PG", "KO", "PEP",
  // Industrials & energy
  "BA", "CAT", "GE", "HON", "UPS", "LMT", "XOM", "CVX", "COP", "SLB",
  // Other
  "DIS", "T", "VZ", "TSLA", "NFLX",
  // Index ETFs for reference
  "SPY", "QQQ", "IWM", "DIA",
];

interface SymbolResult {
  symbol: string;
  bars: number;
  all: Stats;
  inSample: Stats;
  outSample: Stats;
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function pct(v: number | null, digits = 1): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}
function num(v: number | null, digits = 2): string {
  return v === null ? "—" : v.toFixed(digits);
}

async function fetchBars(symbol: string, from: string, to: string): Promise<Bar[]> {
  const res = await yf.chart(symbol, { period1: from, period2: to, interval: "1d" });
  return res.quotes
    .filter(
      (q) =>
        q.open != null && q.high != null && q.low != null && q.close != null && q.date != null,
    )
    .map((q) => ({
      ts: new Date(q.date as unknown as string).getTime(),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: (q.volume as number) ?? 0,
    }));
}

function yearsBetween(fromTs: number, toTs: number): number {
  return (toTs - fromTs) / (365.25 * 86_400_000);
}

function row(symbol: string, s: Stats, pad = 6): string {
  return (
    `${symbol.padEnd(pad)} ${String(s.trades).padStart(5)} ` +
    `${pct(s.winRate).padStart(7)} ${num(s.profitFactor).padStart(6)} ` +
    `${pct(s.avgReturnPct, 2).padStart(8)} ${num(s.tradesPerYear, 1).padStart(6)} ` +
    `${pct(s.maxDrawdownPct).padStart(7)}`
  );
}

const HEADER =
  `${"SYM".padEnd(6)} ${"TRADES".padStart(5)} ${"WIN".padStart(7)} ${"PF".padStart(6)} ` +
  `${"AVG".padStart(8)} ${"T/YR".padStart(6)} ${"MAXDD".padStart(7)}`;

async function main() {
  const from = arg("--from") ?? "2011-01-01";
  const to = arg("--to") ?? new Date().toISOString().slice(0, 10);
  const splitDate = arg("--split") ?? "2021-01-01";
  const splitTs = new Date(splitDate).getTime();
  const loose = process.argv.includes("--loose");
  const symbols = (arg("--symbols")?.split(",").map((s) => s.trim().toUpperCase()) ?? UNIVERSE)
    .filter(Boolean);

  const params: PrimerSaltoParams = { ...DEFAULT_PARAMS, useExhaust: !loose };

  console.log("Primer Salto — symbol study");
  console.log("=".repeat(27));
  console.log(`Mode:    ${loose ? "FREQUENCY (rule 2 off)" : "STRICT (full checklist)"}`);
  console.log(`Window:  ${from} → ${to}`);
  console.log(`Split:   train < ${splitDate} ≤ test`);
  console.log(`Symbols: ${symbols.length}\n`);

  const results: SymbolResult[] = [];
  const failures: string[] = [];
  const allTrades = new Map<string, Trade[]>();

  for (const symbol of symbols) {
    process.stdout.write(`  ${symbol.padEnd(6)}`);
    try {
      const bars = await fetchBars(symbol, from, to);
      if (bars.length < 300) {
        console.log(" — not enough history, skipped");
        failures.push(`${symbol} (only ${bars.length} bars)`);
        continue;
      }
      const trades = simulate(bars, params);
      allTrades.set(symbol, trades);

      const firstTs = bars[0].ts;
      const lastTs = bars[bars.length - 1].ts;
      const inTrades = tradesInWindow(trades, firstTs, splitTs);
      const outTrades = tradesInWindow(trades, splitTs, lastTs + 1);

      results.push({
        symbol,
        bars: bars.length,
        all: summarize(trades, yearsBetween(firstTs, lastTs)),
        inSample: summarize(inTrades, yearsBetween(firstTs, Math.min(splitTs, lastTs))),
        outSample: summarize(outTrades, yearsBetween(Math.max(splitTs, firstTs), lastTs)),
      });
      console.log(` ${String(trades.length).padStart(3)} trades`);
    } catch (err) {
      console.log(` — failed: ${err instanceof Error ? err.message : String(err)}`);
      failures.push(symbol);
    }
  }

  if (results.length === 0) {
    console.error("\nNo symbols produced data. Check the network and try again.");
    process.exit(1);
  }

  // ── Full period, sorted by profit factor ──────────────────────────────
  const ranked = [...results].sort(
    (a, b) => (b.all.profitFactor ?? -1) - (a.all.profitFactor ?? -1),
  );
  console.log(`\n\nFULL PERIOD (${from} → ${to}), sorted by profit factor`);
  console.log("-".repeat(52));
  console.log(HEADER);
  for (const r of ranked) console.log(row(r.symbol, r.all));

  // ── The honest part: rank on train, judge on test ─────────────────────
  const TOP_N = 10;
  const MIN_TRAIN_TRADES = 3;
  const trainRanked = results
    .filter((r) => r.inSample.trades >= MIN_TRAIN_TRADES && r.inSample.profitFactor !== null)
    .sort((a, b) => (b.inSample.profitFactor ?? -1) - (a.inSample.profitFactor ?? -1));
  const picks = trainRanked.slice(0, TOP_N);

  console.log(`\n\nSELECTION TEST — top ${TOP_N} by TRAIN, then their TEST result`);
  console.log(`(train: ${from} → ${splitDate}   test: ${splitDate} → ${to})`);
  console.log("-".repeat(72));
  console.log(
    `${"SYM".padEnd(6)} ${"TR_N".padStart(5)} ${"TR_PF".padStart(6)} ${"TR_WIN".padStart(7)}  |  ` +
      `${"TE_N".padStart(5)} ${"TE_PF".padStart(6)} ${"TE_WIN".padStart(7)} ${"TE_AVG".padStart(8)}`,
  );
  let held = 0;
  for (const r of picks) {
    const kept = stayedProfitable(r.outSample);
    if (kept) held += 1;
    console.log(
      `${r.symbol.padEnd(6)} ${String(r.inSample.trades).padStart(5)} ` +
        `${num(r.inSample.profitFactor).padStart(6)} ${pct(r.inSample.winRate).padStart(7)}  |  ` +
        `${String(r.outSample.trades).padStart(5)} ${num(r.outSample.profitFactor).padStart(6)} ` +
        `${pct(r.outSample.winRate).padStart(7)} ${pct(r.outSample.avgReturnPct, 2).padStart(8)}` +
        `  ${kept ? "held" : "FADED"}`,
    );
  }
  console.log(
    `\n  ${held} of ${picks.length} picks stayed profitable out of sample. ` +
      `If that is near half, the ranking was mostly luck.`,
  );

  // ── Portfolio view: what watching everything actually gives you ───────
  const combined = [...allTrades.values()].flat().sort((a, b) => a.entryTs - b.entryTs);
  const spanYears = yearsBetween(
    Math.min(...combined.map((t) => t.entryTs)),
    Math.max(...combined.map((t) => t.entryTs)),
  );
  const portfolio = summarize(combined, spanYears);
  console.log(`\n\nWATCHING ALL ${results.length} SYMBOLS AT ONCE`);
  console.log("-".repeat(52));
  console.log(`  Signals total:      ${portfolio.trades}`);
  console.log(`  Signals per year:   ${num(portfolio.tradesPerYear, 1)}`);
  console.log(`  Signals per month:  ${num((portfolio.tradesPerYear ?? 0) / 12, 1)}`);
  console.log(`  Win rate:           ${pct(portfolio.winRate)}`);
  console.log(`  Profit factor:      ${num(portfolio.profitFactor)}`);
  console.log(`  Average trade:      ${pct(portfolio.avgReturnPct, 2)}`);

  const outCombined = combined.filter((t) => t.entryTs >= splitTs);
  const outPortfolio = summarize(
    outCombined,
    yearsBetween(splitTs, Math.max(...combined.map((t) => t.entryTs))),
  );
  console.log(`\n  Out of sample only (${splitDate} onward):`);
  console.log(`    Signals: ${outPortfolio.trades}   PF: ${num(outPortfolio.profitFactor)}` +
    `   Win: ${pct(outPortfolio.winRate)}   Avg: ${pct(outPortfolio.avgReturnPct, 2)}`);

  const outFile = path.resolve(process.cwd(), `primer-salto-study${loose ? "-loose" : ""}.json`);
  writeFileSync(outFile, JSON.stringify({ params, from, to, splitDate, results }, null, 2));
  console.log(`\nFull numbers written to ${outFile}`);
  if (failures.length) console.log(`Skipped: ${failures.join(", ")}`);
  console.log("\nEducational analysis of historical data. Not financial advice.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
