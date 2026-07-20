import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { alpaca } from "@/lib/alpaca/client";
import { toAppSymbol } from "@/lib/alpaca/symbols";

export const dynamic = "force-dynamic";

interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
}

export async function GET() {
  if (!env.hasAlpacaKeys) return NextResponse.json([]);
  try {
    const positions = (await alpaca.getPositions()) as AlpacaPosition[];
    return NextResponse.json(
      positions.map((p) => ({
        symbol: toAppSymbol(p.symbol),
        qty: Number(p.qty),
        avgEntryPrice: Number(p.avg_entry_price),
        currentPrice: Number(p.current_price),
        marketValue: Number(p.market_value),
        unrealizedPl: Number(p.unrealized_pl),
        unrealizedPlPct: Number(p.unrealized_plpc) * 100,
        side: p.side,
      })),
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
