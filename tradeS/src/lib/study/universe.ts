/**
 * The symbols the Primer Salto study measured.
 *
 * The study and the live runner MUST read the same list from here. If the
 * runner traded a different set, its results would have nothing to do with
 * the backtest that justified running it at all — and that divergence is the
 * kind that goes unnoticed for months.
 *
 * Liquid US names with a full history back to 2011, spread across sectors so
 * the measured edge is not just one industry's decade.
 */
export const PRIMER_SALTO_UNIVERSE = [
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
] as const;

export type UniverseSymbol = (typeof PRIMER_SALTO_UNIVERSE)[number];
