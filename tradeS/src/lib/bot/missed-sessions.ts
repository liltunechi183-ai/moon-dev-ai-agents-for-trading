/**
 * Which trading sessions went by without Primer Salto looking at them.
 *
 * The strategy is a standing appointment at 15:50. A laptop asleep at that
 * minute does not fail — it is simply absent, and absence writes nothing
 * anywhere. Two sessions were lost that way before anyone noticed, and only
 * because someone thought to go and count rows.
 *
 * A missed session is cheap on its own: at 0.11 signals a day, most of them
 * would have been silent regardless. What is expensive is not knowing, since
 * the same silence covers "nothing qualified today" and "this has not run
 * since Tuesday" — and the first is the strategy working exactly as designed.
 *
 * Pure, and given the session calendar rather than deriving one: holidays
 * are not a weekday rule, and an alert that fires on Labor Day teaches its
 * reader to dismiss it.
 */

export interface MissedReport {
  missed: string[];
  /** Sessions checked, so "0 missed" can distinguish diligence from a blank. */
  checked: number;
  lastScan: string | null;
}

/**
 * Sessions in `tradingDays` with no scan recorded, ignoring `today`.
 *
 * Today is excluded deliberately: the appointment is late in the afternoon,
 * so a morning check would report every single day as missed and the alert
 * would be worthless by its second firing.
 *
 * Sessions before the first recorded scan are excluded too. The heartbeat
 * only began on the day it shipped, and reporting every session prior as
 * missed would bury the one or two that actually were.
 */
export function missedSessions(
  tradingDays: readonly string[],
  scannedDates: readonly string[],
  today: string,
): MissedReport {
  const scanned = new Set(scannedDates);
  const ordered = [...scanned].sort();
  const firstScan = ordered[0] ?? null;
  const lastScan = ordered[ordered.length - 1] ?? null;

  // No scan on record means no baseline to judge against — a fresh install,
  // or the first boot after the strategy was switched on. Reporting the
  // whole lookback as missed there would open with an alarm about days
  // nobody ever expected it to cover, which is how an alert gets muted
  // before it has ever said anything true.
  if (firstScan === null) return { missed: [], checked: 0, lastScan: null };

  const candidates = tradingDays
    .filter((day) => day < today && day >= firstScan)
    .sort();

  return {
    missed: candidates.filter((day) => !scanned.has(day)),
    checked: candidates.length,
    lastScan,
  };
}

/** What to say about it, or null when there is nothing worth saying. */
export function missedSessionsMessage(report: MissedReport): string | null {
  if (report.missed.length === 0) return null;

  const days = report.missed.join(", ");
  const plural = report.missed.length === 1 ? "sesión" : "sesiones";
  const verb = report.missed.length === 1 ? "revisó" : "revisaron";

  return (
    `No se ${verb} ${report.missed.length} ${plural} de mercado: ${days}. ` +
    `Casi siempre significa que el Mac estaba dormido o la terminal cerrada a las 15:50 ET. ` +
    `Ninguna orden se perdió por un fallo del bot — simplemente no llegó a mirar.`
  );
}
