/**
 * Alpaca's wire notation uses a dot for share classes (e.g. "BRK.B") while
 * the rest of this app (and most other data providers) use a dash
 * ("BRK-B"). Convert at the edges — everywhere else in the app, symbols are
 * in app/dash notation.
 */
export function toAlpacaSymbol(appSymbol: string): string {
  return appSymbol.replace(/-/g, ".");
}

export function toAppSymbol(alpacaSymbol: string): string {
  return alpacaSymbol.replace(/\./g, "-");
}

/** International tickers (e.g. "TD.TO", "2330.TW") are never routed to Alpaca. */
export function isUsTicker(symbol: string): boolean {
  return !symbol.includes(".");
}
