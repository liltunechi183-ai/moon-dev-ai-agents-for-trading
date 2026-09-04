/**
 * The filesystem half of the single-instance guard. The decision logic lives
 * in `@/lib/worker-lock`, where it can be tested without staging processes.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { acquireLock, releaseLock, type LockFs } from "@/lib/worker-lock";

const realFs: LockFs = {
  read: (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
  write: (path, contents) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, "utf8");
  },
  remove: (path) => rmSync(path, { force: true }),
};

/**
 * ESRCH means the process is gone. EPERM means it exists but belongs to
 * another user — alive, and emphatically not ours to take over. Anything
 * else is unexpected, and the safe reading of "unexpected" here is "assume
 * it is running": a refused start is recoverable, a duplicate order is not.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Claim the right to be the only worker for this database, or exit.
 *
 * `tsx watch` restarts the worker by killing the child and starting a new
 * one, and the two briefly overlap. That is a handover, not a second
 * instance, so a held lock is retried for a few seconds before it is
 * believed — long enough for an outgoing worker to release, far shorter than
 * the lifetime of a genuine duplicate.
 */
export async function claimSingleInstance(databasePath: string): Promise<() => void> {
  const lockPath = resolve(`${databasePath}.worker.lock`);
  const attempts = 4;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = acquireLock(lockPath, process.pid, realFs, isAlive);

    if (result.ok) {
      if (result.tookOverStale) {
        console.log("[worker] took over a lock left behind by a previous run");
      }
      const release = () => releaseLock(lockPath, process.pid, realFs);
      // Cover the ordinary exits. A SIGKILL leaves the file behind, which is
      // why a stale lock is recoverable rather than fatal.
      process.once("exit", release);
      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
        process.once(signal, () => {
          release();
          process.exit(0);
        });
      }
      return release;
    }

    if (attempt < attempts) {
      await sleep(1000);
      continue;
    }

    console.error(
      `\n[worker] REFUSING TO START — another worker (pid ${result.heldBy}) is already ` +
        `running against ${databasePath}.\n\n` +
        "  Two workers means two schedulers: both wake at 15:50, both see no position,\n" +
        "  and both send the order — twice the size and twice the risk intended.\n\n" +
        `  Stop the other one first, or:  kill ${result.heldBy}\n` +
        '  To see it:  pgrep -fl "worker/index.ts"\n',
    );
    process.exit(1);
  }

  // Unreachable: the loop either returns or exits.
  throw new Error("unreachable");
}
