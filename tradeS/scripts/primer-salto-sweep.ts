// How wide should the stop be? And how much does that depend on how you size?
//
//   npx tsx scripts/primer-salto-sweep.ts
//   npx tsx scripts/primer-salto-sweep.ts --loose --split 2021-01-01
//
// Two columns decide different things and they do not agree:
//
//   %/trade  — the yardstick when every trade gets the SAME DOLLARS. A wider
//              stop survives more noise, so more trades reach the target.
//   avgR     — the yardstick when every trade risks the SAME FRACTION of the
//              account. A wider stop buys fewer shares, so covering three
//              times a large risk is not better than three times a small one.
//
// Pick the sizing method first; the stop then falls out of the table. Choosing
// a stop without saying how you size is choosing half a decision.
//
// Same discipline as the symbol study: every row is shown on a training window
// AND on a later window the choice never touched. A width that only shines in
// one of them was noise.
import YahooFinance from "yahoo-finance2";
import {
  DEFAULT_PARAMS,
  simulate,
  summarize,
  tradesInWindow,
  checkEligibility,
  type PrimerSaltoParams,
  type Stats,
} from "../src/lib/study/primer-salto";
import { PRIMER_SALTO_UNIVERSE, PRIMER_SALTO_CANDIDATES } from "../src/lib/study/universe";
import type { Bar } from "../src/lib/quant/types";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const STOP_MULTS = [0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0];
// Reaches past 4R deliberately: if results keep improving all the way out,
// the target is not binding and the time exit is doing the work — which is a
// different finding from "a more distant target is better".
const R_MULTS = [2.0, 3.0, 4.0, 5.0, 6.0];

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
function pct(v: number | null, d = 2): string {
  return v === null ? "—" : `${(v * 100).toFixed(d)}%`;
}
function num(v: number | null, d = 3): string {
  return v === null ? "—" : v.toFixed(d);
}

async function fetchBars(symbol: string, from: string, to: string): Promise<Bar[]> {
  const res = await yf.chart(symbol, { period1: from, period2: to, interval: "1d" });
  return res.quotes
    .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null && q.date != null)
    .map((q) => ({
      ts: new Date(q.date as unknown as string).getTime(),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: (q.volume as number) ?? 0,
    }));
}

interface Row {
  atrStopMult: number;
  rMult: number;
  inSample: Stats;
  outSample: Stats;
}

async function main() {
  const from = arg("--from") ?? "2011-01-01";
  const to = arg("--to") ?? new Date().toISOString().slice(0, 10);
  const splitDate = arg("--split") ?? "2021-01-01";
  const splitTs = new Date(splitDate).getTime();
  const loose = process.argv.includes("--loose");
  const wide = process.argv.includes("--wide");
  const minDollarVolume = Number(arg("--min-dollar-volume") ?? 2e7);
  const pool = wide ? PRIMER_SALTO_CANDIDATES : PRIMER_SALTO_UNIVERSE;

  console.log("Primer Salto — stop width vs sizing method");
  console.log("=".repeat(42));
  console.log(`Mode:    ${loose ? "FREQUENCY (rule 2 off)" : "STRICT (full checklist)"}`);
  console.log(`Window:  ${from} → ${to}   split ${splitDate}`);
  console.log(`Symbols: ${pool.length}${wide ? " candidates (wide pool)" : ""}\n`);

  // Fetch once, reuse for every parameter combination. Refetching per combo
  // would be 21x the requests for identical data.
  process.stdout.write("Fetching bars");
  const barsBySymbol = new Map<string, Bar[]>();
  for (const symbol of pool) {
    try {
      const bars = await fetchBars(symbol, from, to);
      if (checkEligibility({ bars, minBars: 300, minDollarVolume }).eligible) {
        barsBySymbol.set(symbol, bars);
      }
      process.stdout.write(".");
    } catch {
      process.stdout.write("x");
    }
  }
  console.log(`\n${barsBySymbol.size} symbols with usable history.\n`);

  if (barsBySymbol.size === 0) {
    console.error("No data. Check the network and try again.");
    process.exit(1);
  }

  const rows: Row[] = [];
  for (const rMult of R_MULTS) {
    for (const atrStopMult of STOP_MULTS) {
      const params: PrimerSaltoParams = {
        ...DEFAULT_PARAMS,
        useExhaust: !loose,
        atrStopMult,
        rMult,
      };
      const inTrades = [];
      const outTrades = [];
      let firstTs = Infinity;
      let lastTs = 0;
      for (const bars of barsBySymbol.values()) {
        const trades = simulate(bars, params);
        firstTs = Math.min(firstTs, bars[0].ts);
        lastTs = Math.max(lastTs, bars[bars.length - 1].ts);
        inTrades.push(...tradesInWindow(trades, bars[0].ts, splitTs));
        outTrades.push(...tradesInWindow(trades, splitTs, bars[bars.length - 1].ts + 1));
      }
      const yrsIn = (Math.min(splitTs, lastTs) - firstTs) / (365.25 * 86_400_000);
      const yrsOut = (lastTs - Math.max(splitTs, firstTs)) / (365.25 * 86_400_000);
      rows.push({
        atrStopMult,
        rMult,
        inSample: summarize(inTrades, yrsIn),
        outSample: summarize(outTrades, yrsOut),
      });
    }
  }

  for (const rMult of R_MULTS) {
    console.log(`\nTARGET ${rMult}R`);
    console.log("-".repeat(84));
    console.log(
      `${"STOP".padEnd(7)} ${"IS_N".padStart(6)} ${"IS_%/t".padStart(8)} ${"IS_avgR".padStart(8)}  |  ` +
        `${"OOS_N".padStart(6)} ${"OOS_%/t".padStart(8)} ${"OOS_avgR".padStart(9)} ${"OOS_WIN".padStart(8)} ${"OOS_PF".padStart(7)}`,
    );
    for (const r of rows.filter((x) => x.rMult === rMult)) {
      console.log(
        `${(r.atrStopMult + "·ATR").padEnd(7)} ${String(r.inSample.trades).padStart(6)} ` +
          `${pct(r.inSample.avgReturnPct).padStart(8)} ${num(r.inSample.avgR).padStart(8)}  |  ` +
          `${String(r.outSample.trades).padStart(6)} ${pct(r.outSample.avgReturnPct).padStart(8)} ` +
          `${num(r.outSample.avgR).padStart(9)} ${pct(r.outSample.winRate, 1).padStart(8)} ` +
          `${num(r.outSample.profitFactor, 2).padStart(7)}`,
      );
    }
  }

  // ── The two answers, each chosen on TRAIN and reported on TEST ───────────
  const byPct = [...rows].sort((a, b) => (b.inSample.avgReturnPct ?? -1) - (a.inSample.avgReturnPct ?? -1))[0];
  const byR = [...rows].sort((a, b) => (b.inSample.avgR ?? -99) - (a.inSample.avgR ?? -99))[0];
  const current = rows.find(
    (r) => r.atrStopMult === DEFAULT_PARAMS.atrStopMult && r.rMult === DEFAULT_PARAMS.rMult,
  );

  console.log("\n\nWHAT TO USE, GIVEN HOW YOU SIZE");
  console.log("-".repeat(84));
  console.log("Fixed DOLLARS per trade (what the runner does today):");
  console.log(
    `  best on train: ${byPct.atrStopMult}·ATR / ${byPct.rMult}R` +
      `  → out of sample ${pct(byPct.outSample.avgReturnPct)} per trade (${byPct.outSample.trades} trades)`,
  );
  console.log("Fixed RISK per trade (a fraction of the account):");
  console.log(
    `  best on train: ${byR.atrStopMult}·ATR / ${byR.rMult}R` +
      `  → out of sample ${num(byR.outSample.avgR)} R per trade (${byR.outSample.trades} trades)`,
  );
  if (current) {
    console.log(
      `\nRunning today: ${current.atrStopMult}·ATR / ${current.rMult}R` +
        `  → out of sample ${pct(current.outSample.avgReturnPct)} per trade, ${num(current.outSample.avgR)} R`,
    );
  }
  console.log(
    "\nIf the two rows disagree, that is the point: the stop is not separable\nfrom the sizing method. Decide sizing first.",
  );
  console.log("\nEducational analysis of historical data. Not financial advice.");
}

main().catch((err) => {
  console.error("Sweep failed:", err);
  process.exit(1);
});
