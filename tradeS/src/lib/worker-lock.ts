/**
 * One worker per database, enforced at boot.
 *
 * A second worker is not a duplicate of a harmless daemon. Every runner it
 * carries is scheduled on wall-clock time, so two copies wake up in the same
 * second, read the same broker state, both conclude the symbol is unheld,
 * and both send the order. The result is a position of twice the intended
 * size with twice the intended risk — placed by a system whose entire design
 * is about sizing risk deliberately.
 *
 * Nothing in the stack prevented that. SQLite serialises writes, which
 * protects the file and says nothing about intent; Alpaca is happy to fill
 * two orders. The only visible symptom was a market-data stream complaining
 * that its single slot was taken — a message about quotes, easy to read as
 * cosmetic, which is exactly what it was until the strategy went live.
 *
 * So the check moves to boot, where the cost of being wrong is a refused
 * start instead of an unwanted position.
 *
 * The logic is separated from the filesystem here because "does this lock
 * hold?" is the part worth testing, and the answers that matter — a stale
 * lock from a crash, a live lock from a real second instance — are painful
 * to stage with real processes and trivial to state as data.
 */

export interface LockFs {
  /** File contents, or null when the file does not exist. */
  read(path: string): string | null;
  write(path: string, contents: string): void;
  remove(path: string): void;
}

export type LockResult =
  | { ok: true; tookOverStale: boolean }
  | { ok: false; heldBy: number };

/**
 * Claim the lock for `pid`, or report who holds it.
 *
 * A lock file left behind by a crash names a process that no longer exists.
 * Refusing to start because of one would mean a hard kill takes the worker
 * offline until somebody deletes a file by hand — an outage caused entirely
 * by the safety mechanism. So a lock whose owner is gone is taken over, and
 * only a lock whose owner is still running is honoured.
 */
export function acquireLock(
  path: string,
  pid: number,
  fs: LockFs,
  isAlive: (pid: number) => boolean,
): LockResult {
  const existing = fs.read(path);
  const owner = existing === null ? null : parsePid(existing);

  if (owner !== null && owner !== pid && isAlive(owner)) {
    return { ok: false, heldBy: owner };
  }

  // Unreadable contents count as stale rather than as a held lock: a
  // truncated or corrupt file is evidence of a crash, not of a live worker,
  // and treating it as held would wedge the worker shut for good.
  fs.write(path, String(pid));
  return { ok: true, tookOverStale: owner !== null && owner !== pid };
}

/**
 * Drop the lock, but only if we still own it.
 *
 * Without the ownership check, a worker shutting down slowly could delete a
 * lock a successor had already claimed — handing the next arrival a free
 * pass and reintroducing the double exactly when a restart is in progress.
 */
export function releaseLock(path: string, pid: number, fs: LockFs): void {
  const existing = fs.read(path);
  if (existing === null) return;
  if (parsePid(existing) !== pid) return;
  fs.remove(path);
}

function parsePid(contents: string): number | null {
  const pid = Number(contents.trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}
