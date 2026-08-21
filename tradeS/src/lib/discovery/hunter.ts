import { gte, desc } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getTrackedSymbols } from "@/lib/tracked";
import { getDailyBars } from "@/lib/yahoo/quotes";
import { cacheDailyBars } from "@/lib/bars";
import { computeSnapshot } from "@/lib/quant/indicators";
import { getCurrentRegime } from "@/lib/research/regime";
import { getMarketContextSection } from "@/lib/sources/market-context";
import { parseDiscovery, type DiscoveryPick } from "./schema";
import { filterPicks } from "./dedupe";
import { getCommodityBlock } from "./commodities";
import { DISCOVERY_SYSTEM, buildScanPrompt } from "./prompts";
import { REASONING_MODEL } from "@/lib/models";

// The scan is a long, tool-heavy run (up to 40 turns of WebSearch/WebFetch),
// so it gets the deep-reasoning model. See src/lib/models.ts.
export const DISCOVERY_MODEL = REASONING_MODEL;
const MIN_BARS_SANITY = 30;
const RECENT_THEME_LOOKBACK = 8;
const SURFACE_LOOKBACK_DAYS = 90;

/** Exclusions: tracked symbols ∪ any pending discovery (any age) ∪ any
 * discovery surfaced in the last 90 days (any status). */
export function getExclusions(): string[] {
  const tracked = getTrackedSymbols();
  const cutoff = Date.now() - SURFACE_LOOKBACK_DAYS * 86_400_000;
  const recent = db
    .select({ symbol: tables.discoveries.symbol, status: tables.discoveries.status, createdAt: tables.discoveries.createdAt })
    .from(tables.discoveries)
    .all()
    .filter((d) => d.status === "pending" || d.createdAt >= cutoff)
    .map((d) => d.symbol);
  return Array.from(new Set([...tracked, ...recent]));
}

function recentThemes(): string[] {
  return db
    .select({ theme: tables.discoveries.theme })
    .from(tables.discoveries)
    .orderBy(desc(tables.discoveries.createdAt))
    .limit(RECENT_THEME_LOOKBACK)
    .all()
    .map((d) => d.theme);
}

async function runScanQuery(prompt: string): Promise<{ text: string; model: string | null }> {
  let model: string | null = null;
  let resultText: string | null = null;
  const q = query({
    prompt,
    options: {
      model: DISCOVERY_MODEL,
      systemPrompt: DISCOVERY_SYSTEM,
      allowedTools: ["WebSearch", "WebFetch"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 40, // a survey + several drill-downs needs more than the analyst's 20
      settingSources: [],
    },
  });
  for await (const message of q) {
    if (message.type === "system" && message.subtype === "init") {
      model = (message as { model?: string }).model ?? null;
    } else if (message.type === "result") {
      if (message.subtype === "success") resultText = message.result;
      else throw new Error(`discovery scan ended without result (${message.subtype})`);
    }
  }
  if (resultText === null) throw new Error("discovery scan produced no result");
  return { text: resultText, model };
}

export interface ScanResult {
  scanId: number;
  inserted: number;
  dropped: Array<{ symbol: string; reason: string }>;
}

/** Run one dark-horse scan and insert survivors as pending. */
export async function runDiscoveryScan(): Promise<ScanResult> {
  const today = new Date().toISOString().slice(0, 10);
  const [macroLines, regime, commodityBlock] = await Promise.all([
    getMarketContextSection().catch(() => null),
    getCurrentRegime().catch(() => null),
    getCommodityBlock().catch(() => "(commodity data unavailable)"),
  ]);
  const exclusions = getExclusions();

  const prompt = buildScanPrompt({
    today,
    macroLines: macroLines ?? "(market context unavailable)",
    regime,
    commodityBlock,
    exclusions,
    recentThemes: recentThemes(),
  });

  const first = await runScanQuery(prompt);
  let parsed = parseDiscovery(first.text);
  let model = first.model;
  if (!parsed.ok) {
    const retry = await runScanQuery(
      `${prompt}\n\nYour previous answer failed validation: ${parsed.error}\nRemember: every pick needs at least one source. Output ONLY the corrected JSON.`,
    );
    parsed = parseDiscovery(retry.text);
    model = retry.model;
  }
  if (!parsed.ok) {
    console.warn(`[discovery] scan failed validation twice: ${parsed.error}`);
    return { scanId: Date.now(), inserted: 0, dropped: [] };
  }

  const { kept, dropped } = filterPicks(parsed.output.picks, new Set(exclusions));
  for (const d of dropped) console.log(`[discovery] dropped ${d.symbol}: ${d.reason}`);

  // Ticker sanity check + price/ATR snapshot + warm bars_cache.
  const scanId = Date.now();
  let inserted = 0;
  for (const pick of kept) {
    const survivor = await sanityCheckAndInsert(pick, scanId, model);
    if (survivor) inserted++;
    else dropped.push({ symbol: pick.symbol, reason: "hallucinated/illiquid ticker (bars check)" });
  }

  console.log(`[discovery] scan ${scanId}: inserted ${inserted}, dropped ${dropped.length}`);
  return { scanId, inserted, dropped };
}

async function sanityCheckAndInsert(
  pick: DiscoveryPick,
  scanId: number,
  model: string | null,
): Promise<boolean> {
  let bars;
  try {
    bars = await getDailyBars(pick.symbol, 260);
  } catch {
    return false;
  }
  if (bars.length < MIN_BARS_SANITY) return false;
  cacheDailyBars(pick.symbol, bars);

  const snapshot = computeSnapshot(bars);
  const priceAtDiscovery = bars[bars.length - 1].close; // last close
  const atrPctAtDiscovery = snapshot.atrPct;

  db.insert(tables.discoveries)
    .values({
      scanId,
      symbol: pick.symbol.toUpperCase(),
      companyName: pick.companyName,
      angle: pick.angle,
      theme: pick.theme,
      thesis: pick.thesis,
      whyOverlooked: pick.whyOverlooked,
      catalysts: pick.catalysts,
      risks: pick.risks,
      sources: pick.sources,
      confidence: pick.confidence,
      horizonDays: pick.horizonDays,
      model,
      status: "pending",
      createdAt: Date.now(),
      priceAtDiscovery,
      atrPctAtDiscovery,
    })
    .run();
  return true;
}

/** Has any discoveries row been written in the last N days? (catchup guard) */
export function discoveryScannedWithin(days: number): boolean {
  const cutoff = Date.now() - days * 86_400_000;
  return db.select({ id: tables.discoveries.id }).from(tables.discoveries).where(gte(tables.discoveries.createdAt, cutoff)).all().length > 0;
}
