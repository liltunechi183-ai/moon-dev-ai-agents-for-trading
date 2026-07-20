import { NextResponse } from "next/server";
import { killBot } from "@/lib/bot/engine";

export async function POST() {
  const canceled = await killBot();
  return NextResponse.json({ ok: true, canceledOrders: canceled });
}
