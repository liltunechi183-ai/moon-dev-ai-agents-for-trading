"use client";

import { useCallback, useEffect, useState } from "react";
import { OrderTicket, type TicketPrefill } from "@/components/OrderTicket";
import { PositionsTable, type PositionDto } from "@/components/PositionsTable";
import { OrdersTable, type OrderRowDto } from "@/components/OrdersTable";
import { EquityCurve, type EquityPoint } from "@/components/EquityCurve";
import { FundsPanel, SetupPanel } from "@/components/FundsPanel";

interface AccountInfo {
  hasKeys: boolean;
  paper: boolean;
  account: {
    equity: number;
    cash: number;
    buyingPower: number;
    lastEquity: number;
  } | null;
}

const POLL_MS = 15_000;

export default function TradePage() {
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<PositionDto[]>([]);
  const [orders, setOrders] = useState<OrderRowDto[]>([]);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [prefill, setPrefill] = useState<TicketPrefill | null>(null);

  const refresh = useCallback(async () => {
    const [acc, pos, ord, eq] = await Promise.all([
      fetch("/api/trade/account").then((r) => r.json()),
      fetch("/api/trade/positions").then((r) => r.json()),
      fetch("/api/trade/orders").then((r) => r.json()),
      fetch("/api/trade/equity").then((r) => r.json()),
    ]);
    setInfo(acc);
    setPositions(Array.isArray(pos) ? pos : []);
    setOrders(Array.isArray(ord) ? ord : []);
    setEquity(Array.isArray(eq) ? eq : []);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function cancelOrder(alpacaOrderId: string) {
    await fetch(`/api/trade/orders/${alpacaOrderId}`, { method: "DELETE" });
    refresh();
  }

  const acct = info?.account;
  const dayChange = acct ? acct.equity - acct.lastEquity : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-zinc-100">Trade</h1>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-500">
          Paper trading
        </span>
      </div>

      {info && !info.hasKeys && <SetupPanel />}

      {acct && (
        <div className="flex flex-wrap gap-6 rounded-lg border border-white/10 bg-white/[0.02] p-4">
          {[
            { label: "Equity", value: `$${acct.equity.toLocaleString()}` },
            { label: "Cash", value: `$${acct.cash.toLocaleString()}` },
            { label: "Buying power", value: `$${acct.buyingPower.toLocaleString()}` },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">{s.label}</div>
              <div className="text-lg font-semibold tabular-nums text-zinc-100">{s.value}</div>
            </div>
          ))}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Day change</div>
            <div
              className={`text-lg font-semibold tabular-nums ${
                dayChange === null
                  ? "text-zinc-100"
                  : dayChange >= 0
                    ? "text-[#22c55e]"
                    : "text-[#ef4444]"
              }`}
            >
              {dayChange === null ? "—" : `${dayChange >= 0 ? "+" : ""}$${dayChange.toFixed(2)}`}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
          {info?.hasKeys && <OrderTicket prefill={prefill} onSubmitted={refresh} />}
          <FundsPanel />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Equity curve
            </h2>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <EquityCurve points={equity} />
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Positions
            </h2>
            <PositionsTable positions={positions} onClose={setPrefill} />
          </section>
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Orders
            </h2>
            <OrdersTable orders={orders} onCancel={cancelOrder} />
          </section>
        </div>
      </div>
    </div>
  );
}
