"use client";

export interface ScorecardDto {
  pairs: number;
  minPairs: number;
  enoughSamples: boolean;
  discordant: number;
  challengerWins: number;
  championWins: number;
  discordantWinRate: number | null;
  challengerNeutralShare: number;
  neutralShareOk: boolean;
  championBrier: number;
  challengerBrier: number;
  brierOk: boolean;
  regimeBuckets: Array<{ regime: string; championWinRate: number; challengerWinRate: number; samples: number }>;
  regimeCatastrophe: boolean;
  passed: boolean;
  verdict: string;
}

function Check({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-[#22c55e]" : "text-[#ef4444]"}>{ok ? "✓" : "✗"}</span>;
}

export function Scorecard({ scorecard, pairs, minPairs }: { scorecard: ScorecardDto | null; pairs: number; minPairs: number }) {
  const progress = Math.min(100, (pairs / minPairs) * 100);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#38bdf8]/20 bg-[#38bdf8]/[0.03] p-3">
      <div>
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wide text-zinc-500">
          <span>Samples toward the gate</span>
          <span>
            {pairs} / {minPairs}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/10">
          <div className="h-1.5 rounded-full bg-[#38bdf8]" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {scorecard && (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
            <div>
              <Check ok={scorecard.enoughSamples} /> Enough pairs
            </div>
            <div>
              <Check ok={scorecard.discordantWinRate !== null && scorecard.discordantWinRate >= 0.65 && scorecard.discordant >= 8} />{" "}
              Discordant dominance{" "}
              {scorecard.discordantWinRate !== null && (
                <span className="text-zinc-500">
                  ({scorecard.challengerWins}/{scorecard.discordant} = {(scorecard.discordantWinRate * 100).toFixed(0)}%)
                </span>
              )}
            </div>
            <div>
              <Check ok={scorecard.neutralShareOk} /> Neutral share{" "}
              <span className="text-zinc-500">({(scorecard.challengerNeutralShare * 100).toFixed(0)}%)</span>
            </div>
            <div>
              <Check ok={scorecard.brierOk} /> Calibration{" "}
              <span className="text-zinc-500">
                ({scorecard.challengerBrier.toFixed(3)} vs {scorecard.championBrier.toFixed(3)})
              </span>
            </div>
            <div>
              <Check ok={!scorecard.regimeCatastrophe} /> No regime catastrophe
            </div>
          </div>

          {scorecard.regimeBuckets.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-0.5">Regime</th>
                  <th className="py-0.5 text-right">Champion</th>
                  <th className="py-0.5 text-right">Challenger</th>
                  <th className="py-0.5 text-right">n</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.regimeBuckets.map((b) => (
                  <tr key={b.regime}>
                    <td className="py-0.5 text-zinc-400">{b.regime}</td>
                    <td className="py-0.5 text-right tabular-nums text-zinc-400">{(b.championWinRate * 100).toFixed(0)}%</td>
                    <td
                      className={`py-0.5 text-right tabular-nums ${
                        b.challengerWinRate >= b.championWinRate ? "text-[#22c55e]" : "text-[#ef4444]"
                      }`}
                    >
                      {(b.challengerWinRate * 100).toFixed(0)}%
                    </td>
                    <td className="py-0.5 text-right tabular-nums text-zinc-600">{b.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className={`text-xs ${scorecard.passed ? "text-[#22c55e]" : "text-zinc-400"}`}>{scorecard.verdict}</p>
        </>
      )}
    </div>
  );
}
