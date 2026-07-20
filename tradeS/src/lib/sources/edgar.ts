import { env } from "@/lib/env";
import { fetchJson } from "./util";
import { isUsTicker } from "@/lib/alpaca/symbols";

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface Submissions {
  filings: {
    recent: {
      form: string[];
      filingDate: string[];
      primaryDocDescription: string[];
      accessionNumber: string[];
    };
  };
}

let tickerMapCache: { map: Map<string, number>; at: number } | null = null;
const TICKER_MAP_TTL = 24 * 60 * 60_000;

async function getCik(symbol: string): Promise<number | null> {
  if (!tickerMapCache || Date.now() - tickerMapCache.at > TICKER_MAP_TTL) {
    const data = await fetchJson<Record<string, TickerEntry>>(
      "https://www.sec.gov/files/company_tickers.json",
      { headers: { "User-Agent": env.secEdgarUserAgent } },
    );
    const map = new Map<string, number>();
    for (const entry of Object.values(data)) map.set(entry.ticker.toUpperCase(), entry.cik_str);
    tickerMapCache = { map, at: Date.now() };
  }
  return tickerMapCache.map.get(symbol.toUpperCase().replace("-", "")) ?? null;
}

/** Recent SEC filings + Form 4 insider activity, rendered as bullets. */
export async function getEdgarSection(
  symbol: string,
): Promise<{ filings: string | null; insiders: string | null }> {
  if (!isUsTicker(symbol)) return { filings: null, insiders: null };
  const cik = await getCik(symbol);
  if (cik === null) return { filings: null, insiders: null };

  const padded = String(cik).padStart(10, "0");
  const sub = await fetchJson<Submissions>(`https://data.sec.gov/submissions/CIK${padded}.json`, {
    headers: { "User-Agent": env.secEdgarUserAgent },
  });

  const { form, filingDate, primaryDocDescription } = sub.filings.recent;
  const interesting = ["8-K", "10-K", "10-Q", "S-1", "S-3", "SC 13D", "SC 13G"];
  const filingLines: string[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let form4Count90d = 0;
  let lastForm4Date: string | null = null;

  for (let i = 0; i < form.length && filingLines.length < 12; i++) {
    if (filingDate[i] < cutoffStr) break; // list is newest-first
    if (form[i] === "4") {
      form4Count90d++;
      if (!lastForm4Date) lastForm4Date = filingDate[i];
      continue;
    }
    if (interesting.includes(form[i])) {
      const desc = primaryDocDescription[i] ? ` — ${primaryDocDescription[i]}` : "";
      filingLines.push(`- [${filingDate[i]}] ${form[i]}${desc}`);
    }
  }

  const insiders =
    form4Count90d > 0
      ? `${form4Count90d} insider (Form 4) filings in the last 90 days; most recent ${lastForm4Date}. Direction not parsed — worth a targeted lookup if it matters to the thesis.`
      : "No insider (Form 4) filings in the last 90 days.";

  return {
    filings: filingLines.length > 0 ? filingLines.join("\n") : "No notable filings in the last 90 days.",
    insiders,
  };
}
