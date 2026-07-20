import type { Bar, IndicatorSnapshot } from "./types";

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      prev = seed;
      out[i] = seed;
    } else if (i >= period && prev !== null) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) gainSum += change;
    else lossSum += -change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });

  const macdValuesOnly = macdLine.filter((v): v is number => v !== null);
  const firstIdx = macdLine.findIndex((v) => v !== null);
  const signalOnValid = ema(macdValuesOnly, signalPeriod);

  const signal: (number | null)[] = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    for (let i = 0; i < signalOnValid.length; i++) {
      signal[firstIdx + i] = signalOnValid[i];
    }
  }

  const hist: (number | null)[] = values.map((_, i) => {
    const m = macdLine[i];
    const s = signal[i];
    return m !== null && s !== null ? m - s : null;
  });

  return { macd: macdLine, signal, hist };
}

export function atr(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  const trueRanges: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const cur = bars[i];
    if (i === 0) {
      trueRanges.push(cur.high - cur.low);
      continue;
    }
    const prevClose = bars[i - 1].close;
    trueRanges.push(
      Math.max(cur.high - cur.low, Math.abs(cur.high - prevClose), Math.abs(cur.low - prevClose)),
    );
  }
  let sum = 0;
  let prevAtr: number | null = null;
  for (let i = 0; i < bars.length; i++) {
    if (i < period) {
      sum += trueRanges[i];
      if (i === period - 1) {
        prevAtr = sum / period;
        out[i] = prevAtr;
      }
    } else if (prevAtr !== null) {
      prevAtr = (prevAtr * (period - 1) + trueRanges[i]) / period;
      out[i] = prevAtr;
    }
  }
  return out;
}

export function bollingerBands(
  values: number[],
  period = 20,
  numStdDev = 2,
): { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } {
  const mid = sma(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    const m = mid[i];
    if (m === null) continue;
    const window = values.slice(i - period + 1, i + 1);
    const variance = window.reduce((acc, v) => acc + (v - m) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    upper[i] = m + numStdDev * stdDev;
    lower[i] = m - numStdDev * stdDev;
  }
  return { upper, mid, lower };
}

export function obv(bars: Bar[]): number[] {
  const out: number[] = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const prev = out[i - 1];
    if (bars[i].close > bars[i - 1].close) out[i] = prev + bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) out[i] = prev - bars[i].volume;
    else out[i] = prev;
  }
  return out;
}

/** Computes the full indicator snapshot as of the last bar in the series. */
export function computeSnapshot(bars: Bar[]): IndicatorSnapshot {
  const empty: IndicatorSnapshot = {
    sma20: null,
    sma50: null,
    sma200: null,
    ema12: null,
    ema26: null,
    rsi14: null,
    macd: null,
    macdSignal: null,
    macdHist: null,
    atr14: null,
    atrPct: null,
    bollingerUpper: null,
    bollingerLower: null,
    bollingerMid: null,
    bollingerPosition: null,
    obv: null,
    obvSlope: null,
    avgVolume20: null,
    volumeRatio: null,
    week52High: null,
    week52Low: null,
    pctFrom52wHigh: null,
    pctFrom52wLow: null,
    lastClose: null,
  };
  if (bars.length === 0) return empty;

  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const lastIdx = bars.length - 1;
  const lastClose = closes[lastIdx];

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const rsiArr = rsi(closes, 14);
  const macdRes = macd(closes);
  const atrArr = atr(bars, 14);
  const bb = bollingerBands(closes, 20, 2);
  const obvArr = obv(bars);
  const avgVol20 = sma(volumes, 20);

  const lastAtr = atrArr[lastIdx];
  const bbUpper = bb.upper[lastIdx];
  const bbLower = bb.lower[lastIdx];

  const obvSlopeWindow = obvArr.slice(Math.max(0, lastIdx - 10), lastIdx + 1);
  const obvSlope =
    obvSlopeWindow.length >= 2
      ? Math.sign(obvSlopeWindow[obvSlopeWindow.length - 1] - obvSlopeWindow[0])
      : null;

  const yearBars = bars.slice(Math.max(0, bars.length - 252));
  const week52High = yearBars.length ? Math.max(...yearBars.map((b) => b.high)) : null;
  const week52Low = yearBars.length ? Math.min(...yearBars.map((b) => b.low)) : null;

  return {
    sma20: sma20[lastIdx],
    sma50: sma50[lastIdx],
    sma200: sma200[lastIdx],
    ema12: ema12[lastIdx],
    ema26: ema26[lastIdx],
    rsi14: rsiArr[lastIdx],
    macd: macdRes.macd[lastIdx],
    macdSignal: macdRes.signal[lastIdx],
    macdHist: macdRes.hist[lastIdx],
    atr14: lastAtr,
    atrPct: lastAtr !== null && lastClose ? (lastAtr / lastClose) * 100 : null,
    bollingerUpper: bbUpper,
    bollingerLower: bbLower,
    bollingerMid: bb.mid[lastIdx],
    bollingerPosition:
      bbUpper !== null && bbLower !== null && bbUpper !== bbLower
        ? (lastClose - bbLower) / (bbUpper - bbLower)
        : null,
    obv: obvArr[lastIdx],
    obvSlope,
    avgVolume20: avgVol20[lastIdx],
    volumeRatio:
      avgVol20[lastIdx] && avgVol20[lastIdx]! > 0
        ? volumes[lastIdx] / avgVol20[lastIdx]!
        : null,
    week52High,
    week52Low,
    pctFrom52wHigh: week52High ? ((lastClose - week52High) / week52High) * 100 : null,
    pctFrom52wLow: week52Low ? ((lastClose - week52Low) / week52Low) * 100 : null,
    lastClose,
  };
}
