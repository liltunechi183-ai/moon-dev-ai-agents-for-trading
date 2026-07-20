import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { alpaca } from "@/lib/alpaca/client";
import { toAlpacaSymbol } from "@/lib/alpaca/symbols";
import { insertOrderWithLegs, listOrders } from "@/lib/alpaca/orders-log";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listOrders(100));
}

const submitSchema = z
  .object({
    symbol: z.string().trim().min(1).max(12).transform((s) => s.toUpperCase()),
    side: z.enum(["buy", "sell"]),
    type: z.enum(["market", "limit"]),
    qty: z.number().positive().optional(),
    notional: z.number().positive().optional(),
    limitPrice: z.number().positive().optional(),
  })
  .refine((o) => (o.qty != null) !== (o.notional != null), {
    message: "provide exactly one of qty or notional",
  })
  .refine((o) => o.type !== "limit" || o.limitPrice != null, {
    message: "limit orders need a limitPrice",
  });

/** Manual order ticket → Alpaca PAPER account (env.ts picks the host). */
export async function POST(request: Request) {
  if (!env.hasAlpacaKeys) {
    return NextResponse.json({ error: "Alpaca keys not configured" }, { status: 400 });
  }
  const parsed = submitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const o = parsed.data;
  try {
    const order = await alpaca.submitOrder({
      symbol: toAlpacaSymbol(o.symbol),
      side: o.side,
      type: o.type,
      time_in_force: "day",
      ...(o.qty != null ? { qty: String(o.qty) } : { notional: String(o.notional) }),
      ...(o.limitPrice != null ? { limit_price: String(o.limitPrice) } : {}),
    });
    insertOrderWithLegs(order, "manual");
    return NextResponse.json({ orderId: order.id, status: order.status }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
