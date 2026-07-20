"use client";

export interface BotActivityDto {
  id: number;
  ts: number;
  ruleId: number | null;
  symbol: string | null;
  decision: "buy" | "sell" | "skip" | "blocked" | "halt";
  reason: string;
  orderId: string | null;
}

const DECISION_STYLES: Record<string, string> = {
  buy: "bg-[#22c55e]/10 text-[#22c55e]",
  sell: "bg-[#ef4444]/10 text-[#ef4444]",
  skip: "bg-white/[0.05] text-zinc-400",
  blocked: "bg-amber-500/10 text-amber-500",
  halt: "bg-[#ef4444]/20 text-[#ef4444]",
};

export function BotActivityFeed({ activity }: { activity: BotActivityDto[] }) {
  if (activity.length === 0) {
    return <p className="text-sm text-zinc-500">No bot activity yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {activity.map((a) => (
        <li
          key={a.id}
          className="flex items-start gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-xs"
        >
          <span className={`rounded-full px-2 py-0.5 font-medium ${DECISION_STYLES[a.decision]}`}>
            {a.decision}
          </span>
          <div className="flex-1">
            <span className="text-zinc-300">
              {a.symbol && <b className="mr-1">{a.symbol}</b>}
              {a.reason}
            </span>
            <div className="text-[10px] text-zinc-600">{new Date(a.ts).toLocaleString()}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
