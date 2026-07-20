import type { DiscoveryPick } from "./schema";

export interface FilterResult {
  kept: DiscoveryPick[];
  dropped: Array<{ symbol: string; reason: string }>;
}

/** A ticker is "US-listed" for our purposes when it has no exchange suffix
 * (no dot) and isn't an obvious OTC 5-letter-F pattern we can cheaply catch. */
export function isUsListed(symbol: string): boolean {
  if (symbol.includes(".")) return false;
  return true;
}

/**
 * PURE exclusion filter. Drops non-US suffixed tickers, anything in the
 * exclusion set (case-insensitive), and in-batch duplicates. Returns kept
 * picks plus drop reasons for loud logging.
 */
export function filterPicks(picks: DiscoveryPick[], exclusions: Set<string>): FilterResult {
  const exclLower = new Set([...exclusions].map((s) => s.toUpperCase()));
  const seen = new Set<string>();
  const kept: DiscoveryPick[] = [];
  const dropped: Array<{ symbol: string; reason: string }> = [];

  for (const pick of picks) {
    const sym = pick.symbol.toUpperCase();
    if (!isUsListed(pick.symbol)) {
      dropped.push({ symbol: pick.symbol, reason: "non-US suffixed listing" });
      continue;
    }
    if (exclLower.has(sym)) {
      dropped.push({ symbol: pick.symbol, reason: "already tracked or recently surfaced" });
      continue;
    }
    if (seen.has(sym)) {
      dropped.push({ symbol: pick.symbol, reason: "duplicate within this scan" });
      continue;
    }
    seen.add(sym);
    kept.push(pick);
  }

  return { kept, dropped };
}
