"use client";

import { useCallback, useEffect, useState } from "react";
import { ImprovePanel } from "@/components/ImprovePanel";
import { StrategyPanel } from "@/components/StrategyPanel";

export default function StrategyPage() {
  const [data, setData] = useState<Parameters<typeof StrategyPanel>[0]["data"] | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/strategy");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Strategy</h1>
        <p className="text-xs text-zinc-500">
          How the system improves itself — the active playbook, any challenger under test, the
          version history, and the daily agent budget.
        </p>
      </div>
      <ImprovePanel onDone={refresh} />
      {data ? <StrategyPanel data={data} /> : <p className="text-sm text-zinc-500">Loading…</p>}
    </div>
  );
}
