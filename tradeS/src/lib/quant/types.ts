export interface Bar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorSnapshot {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema12: number | null;
  ema26: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  atr14: number | null;
  atrPct: number | null;
  bollingerUpper: number | null;
  bollingerLower: number | null;
  bollingerMid: number | null;
  bollingerPosition: number | null; // 0..1, price's position within the band
  obv: number | null;
  obvSlope: number | null; // sign of OBV trend over the last 10 bars
  avgVolume20: number | null;
  volumeRatio: number | null; // latest volume / avgVolume20
  week52High: number | null;
  week52Low: number | null;
  pctFrom52wHigh: number | null;
  pctFrom52wLow: number | null;
  lastClose: number | null;
}
