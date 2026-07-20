"use client";

export interface RuleStatsDto {
  ruleId: number | null;
  ruleVersion: number | null;
  trades: number;
  wins: number;
  winRate: number;
  totalPnlUsd: number;
  avgPnlPct: number;
  byExitKind: Record<string, { trades: number; totalPnlUsd: number }>;
}

export interface BotTradeDto {
  id: number;
  symbol: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnlUsd: number;
  pnlPct: number;
  exitKind: string;
  exitAt: number;
}

export function BotStatsPanel({
  ruleStats,
  recentTrades,
  ruleNames,
}: {
  ruleStats: RuleStatsDto[];
  recentTrades: BotTradeDto[];
  ruleNames: Map<number, string>;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Realized performance
      </h2>

      {ruleStats.length === 0 ? (
        <p className="text-sm text-zinc-500">No completed round trips yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="py-1 pr-2">Rule</th>
              <th className="py-1 pr-2 text-right">Trades</th>
              <th className="py-1 pr-2 text-right">Win rate</th>
              <th className="py-1 text-right">PnL</th>
            </tr>
          </thead>
          <tbody>
            {ruleStats.map((s, i) => (
              <tr key={i} className="border-b border-white/5 last:border-0">
                <td className="py-1 pr-2 text-zinc-300">
                  {s.ruleId != null ? (ruleNames.get(s.ruleId) ?? `rule ${s.ruleId}`) : "unattributed"}
                  {s.ruleVersion != null && (
                    <span className="ml-1 text-[10px] text-zinc-600">v{s.ruleVersion}</span>
                  )}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums text-zinc-400">{s.trades}</td>
                <td className="py-1 pr-2 text-right tabular-nums text-zinc-300">
                  {(s.winRate * 100).toFixed(0)}%
                </td>
                <td
                  className={`py-1 text-right tabular-nums ${
                    s.totalPnlUsd >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                  }`}
                >
                  {s.totalPnlUsd >= 0 ? "+" : ""}${s.totalPnlUsd.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {recentTrades.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-zinc-500">
            Recent round trips ({recentTrades.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1 text-xs">
            {recentTrades.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="font-medium text-zinc-200">{t.symbol}</span>
                <span className="text-zinc-500">
                  {t.qty} @ {t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)} ({t.exitKind})
                </span>
                <span
                  className={`ml-auto tabular-nums ${t.pnlUsd >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}
                >
                  {t.pnlUsd >= 0 ? "+" : ""}${t.pnlUsd.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
