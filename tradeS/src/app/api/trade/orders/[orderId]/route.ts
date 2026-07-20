import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { alpaca } from "@/lib/alpaca/client";
import { markOrdersCanceled } from "@/lib/alpaca/orders-log";

export async function DELETE(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!env.hasAlpacaKeys) {
    return NextResponse.json({ error: "Alpaca keys not configured" }, { status: 400 });
  }
  const { orderId } = await params;
  try {
    await alpaca.cancelOrder(orderId);
    markOrdersCanceled([orderId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
