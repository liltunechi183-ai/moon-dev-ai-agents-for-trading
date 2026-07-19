import { NextResponse } from "next/server";
import { getCachedDailyBars, cacheDailyBars } from "@/lib/bars";
import { getDailyBars } from "@/lib/yahoo/quotes";

export async function GET(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();

  let bars = getCachedDailyBars(symbol);
  if (bars.length === 0) {
    // Nothing cached yet (worker hasn't primed it) — fetch live so the
    // chart isn't empty on first load, and warm the cache for next time.
    try {
      bars = await getDailyBars(symbol, 260);
      cacheDailyBars(symbol, bars);
    } catch (err) {
      return NextResponse.json({ error: "failed to fetch bars", detail: String(err) }, { status: 502 });
    }
  }

  return NextResponse.json(bars);
}
