"use client";

/**
 * 0-10 confidence bar. When the calibration engine capped the self-report,
 * the bar renders amber at the effective value with the raw value struck
 * through; otherwise cyan at the raw value.
 */
export function ConfidenceMeter({
  raw,
  effective,
  capped,
}: {
  raw: number;
  effective: number;
  capped: boolean;
}) {
  const shown = capped ? effective : raw;
  const color = capped ? "#f59e0b" : "#38bdf8";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${(shown / 10) * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-sm tabular-nums text-zinc-300">
        {capped ? (
          <>
            <s className="text-zinc-600">{raw}</s>{" "}
            <span className="text-amber-500">{effective}</span>/10
          </>
        ) : (
          <>{raw}/10</>
        )}
      </span>
    </div>
  );
}
