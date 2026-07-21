"use client";

import { useCallback, useEffect, useState } from "react";
import { ImprovePanel } from "@/components/ImprovePanel";
import { StrategyPanel } from "@/components/StrategyPanel";
import { useI18n } from "@/lib/i18n/provider";

export default function StrategyPage() {
  const { t } = useI18n();
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
        <h1 className="text-lg font-semibold text-zinc-100">{t("strategy.title")}</h1>
        <p className="text-xs text-zinc-500">{t("strategy.subtitle")}</p>
      </div>
      <ImprovePanel onDone={refresh} />
      {data ? <StrategyPanel data={data} /> : <p className="text-sm text-zinc-500">{t("common.loading")}</p>}
    </div>
  );
}
