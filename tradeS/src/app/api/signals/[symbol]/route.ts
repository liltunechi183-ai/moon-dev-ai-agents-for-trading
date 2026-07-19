import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { getCachedDailyBars, cacheDailyBars } from "@/lib/bars";
import { getDailyBars } from "@/lib/yahoo/quotes";
import { buildQuantPayload } from "@/lib/quant/snapshot";

export async function GET(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();

  const [latest] = db
    .select()
    .from(tables.quantSignals)
    .where(eq(tables.quantSignals.symbol, symbol))
    .orderBy(desc(tables.quantSignals.computedAt))
    .limit(1)
    .all();

  if (latest) return NextResponse.json(latest.payload);

  // Nothing computed yet — compute on demand rather than showing an empty page.
  let bars = getCachedDailyBars(symbol);
  if (bars.length === 0) {
    try {
      bars = await getDailyBars(symbol, 260);
      cacheDailyBars(symbol, bars);
    } catch (err) {
      return NextResponse.json({ error: "failed to fetch bars", detail: String(err) }, { status: 502 });
    }
  }
  return NextResponse.json(buildQuantPayload(bars));
}
