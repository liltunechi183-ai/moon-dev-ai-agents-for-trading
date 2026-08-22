import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { alpaca } from "@/lib/alpaca/client";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!env.hasAlpacaKeys) {
    return NextResponse.json({ hasKeys: false, paper: env.paper, account: null });
  }
  try {
    const account = await alpaca.getAccount();
    return NextResponse.json({
      hasKeys: true,
      paper: env.paper,
      account: {
        equity: Number(account.equity),
        cash: Number(account.cash),
        buyingPower: Number(account.buying_power),
        lastEquity: Number((account as { last_equity?: string }).last_equity ?? account.equity),
        accountNumber: account.account_number ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json({ hasKeys: true, paper: env.paper, account: null, error: String(err) }, { status: 502 });
  }
}
