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

/**
 * A wider candidate pool, for when 69 symbols do not produce enough signals.
 *
 * These are CANDIDATES, not a curated list. The study filters them by two
 * mechanical tests — enough history to backtest, and enough dollar volume to
 * actually trade — and whatever survives is the universe. That matters:
 * hand-picking which names to add would reintroduce exactly the selection
 * effect this whole exercise has been avoiding.
 *
 * Two honest caveats:
 *
 *  • SURVIVORSHIP. These are companies that still exist and are still large
 *    enough to name today. Firms that went bankrupt, were acquired, or fell
 *    out of the index between 2011 and now are absent, and they were the
 *    losers. Any backtest over this list is therefore optimistic, and so was
 *    the 69-symbol one. The bias runs one way and cannot be removed without
 *    historical index membership data.
 *  • Names that listed after 2011 are included where they are liquid today;
 *    the history filter drops them automatically rather than silently
 *    backtesting a short sample.
 */
export const PRIMER_SALTO_CANDIDATES = [
  ...PRIMER_SALTO_UNIVERSE,
  // Tech & semiconductors
  "ACN", "ADI", "ADP", "AKAM", "APH", "CDNS", "CTSH", "EA", "GLW", "HPQ",
  "INTU", "KLAC", "LRCX", "MCHP", "MSI", "NTAP", "NXPI", "PAYX", "SNPS",
  "STX", "SWKS", "TEL", "TER", "TTWO", "VRSN", "WDC", "JKHY", "FFIV",
  // Financials
  "USB", "PNC", "TFC", "COF", "BK", "STT", "TROW", "AMP", "AIG", "MET",
  "PRU", "ALL", "TRV", "PGR", "CB", "AFL", "HIG", "CINF", "MMC", "AON",
  "AJG", "ICE", "CME", "NDAQ", "SPGI", "MCO", "DFS", "FITB", "KEY", "RF",
  "HBAN", "MTB", "NTRS", "BEN", "IVZ",
  // Healthcare
  "GILD", "BIIB", "VRTX", "REGN", "CI", "CVS", "HUM", "ELV", "MCK", "CAH",
  "BDX", "SYK", "BSX", "ZBH", "EW", "ISRG", "A", "WAT", "DGX", "LH",
  "HOLX", "BAX", "MDT", "DHR", "RMD", "STE", "TFX", "WST", "CRL", "MTD",
  // Consumer
  "CL", "KMB", "GIS", "K", "HSY", "SYY", "KR", "DG", "DLTR", "ROST", "TJX",
  "ORLY", "AZO", "BBY", "YUM", "DRI", "CMG", "DPZ", "MAR", "LVS", "WYNN",
  "MGM", "RCL", "CCL", "EXPE", "BKNG", "F", "GM", "BWA", "GPC", "TSCO",
  "WSM", "ULTA", "LULU", "DECK", "RL", "PVH", "MO", "PM", "STZ", "TAP",
  "MNST", "CLX", "CHD", "EL", "SJM", "CAG", "CPB", "HRL", "MKC", "TSN",
  "ADM", "BG",
  // Industrials
  "MMM", "GD", "NOC", "RTX", "LHX", "TDG", "HEI", "ITW", "EMR", "ETN",
  "PH", "ROK", "DOV", "CMI", "PCAR", "FDX", "CSX", "UNP", "NSC", "DE",
  "URI", "FAST", "GWW", "SWK", "MAS", "PNR", "XYL", "AME", "ROP", "JCI",
  "WM", "RSG", "VRSK", "EFX", "NDSN", "SNA", "TXT", "DAL", "UAL", "LUV",
  "ALK",
  // Energy
  "EOG", "OXY", "HES", "DVN", "MRO", "APA", "HAL", "VLO", "WMB", "OKE",
  "TRGP", "EQT",
  // Utilities
  "NEE", "DUK", "SO", "D", "AEP", "EXC", "XEL", "SRE", "PEG", "ED", "WEC",
  "ES", "AEE", "CMS", "DTE", "PPL", "FE", "EIX", "AES", "NI", "LNT", "ATO",
  "CNP",
  // Real estate
  "AMT", "PLD", "CCI", "EQIX", "SPG", "PSA", "O", "WELL", "DLR", "AVB",
  "EQR", "ESS", "MAA", "UDR", "BXP", "VTR", "ARE", "HST", "KIM", "REG",
  "FRT",
  // Materials
  "APD", "SHW", "ECL", "PPG", "NUE", "STLD", "FCX", "NEM", "VMC", "MLM",
  "IP", "PKG", "IFF", "ALB", "CE", "EMN", "LYB", "CF", "MOS",
  // Communications
  "CMCSA", "CHTR", "TMUS", "PARA", "NWSA", "OMC", "IPG", "LYV",
  // Sector ETFs
  "MDY", "XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB",
] as const;
