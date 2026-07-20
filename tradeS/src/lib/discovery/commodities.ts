import { getDailyBars } from "@/lib/yahoo/quotes";

// Keyless Yahoo proxies for a commodity basket. Big movers are flagged so the
// scout traces the value chain.
const BASKET: Array<{ label: string; symbol: string }> = [
  { label: "WTI crude", symbol: "CL=F" },
  { label: "Natural gas", symbol: "NG=F" },
  { label: "Copper", symbol: "HG=F" },
  { label: "Gold", symbol: "GC=F" },
  { label: "Silver", symbol: "SI=F" },
  { label: "Wheat", symbol: "ZW=F" },
  { label: "Lithium/battery (LIT)", symbol: "LIT" },
  { label: "Uranium (URA)", symbol: "URA" },
  { label: "Dry freight (BDRY)", symbol: "BDRY" },
];

const BIG_MOVE_1M = 8; // percent

interface CommodityMove {
  label: string;
  week: number | null;
  month: number | null;
  big: boolean;
}

let cache: { block: string; at: number } | null = null;
const CACHE_MS = 6 * 60 * 60_000;

function pctChange(bars: { close: number }[], lookback: number): number | null {
  if (bars.length <= lookback) return null;
  const last = bars[bars.length - 1].close;
  const prior = bars[bars.length - 1 - lookback].close;
  if (!prior) return null;
  return ((last - prior) / prior) * 100;
}

/** Real 1-week/1-month moves for the basket, rendered as a prompt block.
 * Never throws — a failed fetch just omits that row. */
export async function getCommodityBlock(): Promise<string> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.block;

  const moves: CommodityMove[] = [];
  for (const item of BASKET) {
    try {
      const bars = await getDailyBars(item.symbol, 40);
      const week = pctChange(bars, 5);
      const month = pctChange(bars, 21);
      moves.push({
        label: item.label,
        week,
        month,
        big: month !== null && Math.abs(month) >= BIG_MOVE_1M,
      });
    } catch {
      // omit this row
    }
  }

  const lines = moves.map((m) => {
    const wk = m.week !== null ? `${m.week >= 0 ? "+" : ""}${m.week.toFixed(1)}% 1w` : "1w n/a";
    const mo = m.month !== null ? `${m.month >= 0 ? "+" : ""}${m.month.toFixed(1)}% 1m` : "1m n/a";
    return `- ${m.label}: ${wk}, ${mo}${m.big ? "  ← BIG MOVE — trace the value chain" : ""}`;
  });

  const block = lines.length > 0 ? lines.join("\n") : "(commodity data unavailable this scan)";
  cache = { block, at: Date.now() };
  return block;
}
