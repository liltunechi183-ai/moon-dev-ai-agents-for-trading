"use client";

import { useCallback, useEffect, useState } from "react";
import { PredictionCard } from "@/components/PredictionCard";
import { AccuracyPanel } from "@/components/AccuracyPanel";
import { LessonsFeed } from "@/components/LessonsFeed";
import { useI18n } from "@/lib/i18n/provider";
import type { AccuracyDto, PredictionListItem } from "@/lib/predictions-types";

export default function PredictionsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<PredictionListItem[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [predRes, accRes] = await Promise.all([
      fetch("/api/predictions").then((r) => r.json()),
      fetch("/api/accuracy").then((r) => r.json()),
    ]);
    setItems(predRes);
    setAccuracy(accRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">{t("predictions.title")}</h1>
        <p className="text-xs text-zinc-500">{t("predictions.subtitle")}</p>
      </div>

      {accuracy && <AccuracyPanel stats={accuracy} />}

      <LessonsFeed />

      {loading && <p className="text-sm text-zinc-500">{t("common.loading")}</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-zinc-500">{t("predictions.nothingTracked")}</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <PredictionCard key={item.symbol} item={item} onRefresh={refresh} />
        ))}
      </div>
    </div>
  );
}
