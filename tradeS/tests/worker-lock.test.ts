import { describe, it, expect } from "vitest";
import { acquireLock, releaseLock, type LockFs } from "@/lib/worker-lock";

/** An in-memory disk, so the interesting states can just be stated. */
function fakeFs(initial: Record<string, string> = {}): LockFs & { files: Record<string, string> } {
  const files = { ...initial };
  return {
    files,
    read: (path) => (path in files ? files[path] : null),
    write: (path, contents) => {
      files[path] = contents;
    },
    remove: (path) => {
      delete files[path];
    },
  };
}

const LOCK = "/data/trades.db.worker.lock";
const nobodyAlive = () => false;
const everybodyAlive = () => true;

describe("acquireLock", () => {
  it("claims a free lock and records the owner", () => {
    const fs = fakeFs();
    expect(acquireLock(LOCK, 4242, fs, nobodyAlive)).toEqual({ ok: true, tookOverStale: false });
    expect(fs.files[LOCK]).toBe("4242");
  });

  it("refuses when another LIVE process holds it", () => {
    // The case that matters: two workers means two schedulers, and two
    // schedulers means the same signal bought twice.
    const fs = fakeFs({ [LOCK]: "111" });
    expect(acquireLock(LOCK, 222, fs, everybodyAlive)).toEqual({ ok: false, heldBy: 111 });
    // The incumbent's claim must survive the refused attempt.
    expect(fs.files[LOCK]).toBe("111");
  });

  it("takes over a lock whose owner is gone", () => {
    // A `kill -9` leaves the file behind. Honouring it would mean one hard
    // kill takes the worker offline until a human deletes a file.
    const fs = fakeFs({ [LOCK]: "111" });
    expect(acquireLock(LOCK, 222, fs, nobodyAlive)).toEqual({ ok: true, tookOverStale: true });
    expect(fs.files[LOCK]).toBe("222");
  });

  it("only consults liveness for the pid actually named in the file", () => {
    const asked: number[] = [];
    const fs = fakeFs({ [LOCK]: "777" });
    acquireLock(LOCK, 222, fs, (pid) => {
      asked.push(pid);
      return false;
    });
    expect(asked).toEqual([777]);
  });

  it("is idempotent for the process that already owns it", () => {
    const fs = fakeFs({ [LOCK]: "222" });
    expect(acquireLock(LOCK, 222, fs, everybodyAlive)).toEqual({ ok: true, tookOverStale: false });
  });

  it("treats a corrupt lock file as stale, not as held", () => {
    // A truncated write is evidence of a crash. Reading it as "held" would
    // wedge the worker shut permanently.
    for (const junk of ["", "   ", "not-a-pid", "-5", "0", "3.7"]) {
      const fs = fakeFs({ [LOCK]: junk });
      const result = acquireLock(LOCK, 222, fs, everybodyAlive);
      expect(result.ok, `junk lock ${JSON.stringify(junk)} should not hold`).toBe(true);
      expect(fs.files[LOCK]).toBe("222");
    }
  });

  it("tolerates whitespace around a legitimate pid", () => {
    const fs = fakeFs({ [LOCK]: " 111\n" });
    expect(acquireLock(LOCK, 222, fs, everybodyAlive)).toEqual({ ok: false, heldBy: 111 });
  });
});

describe("releaseLock", () => {
  it("removes a lock the caller owns", () => {
    const fs = fakeFs({ [LOCK]: "222" });
    releaseLock(LOCK, 222, fs);
    expect(fs.files[LOCK]).toBeUndefined();
  });

  it("never deletes a successor's lock", () => {
    // During a restart the outgoing worker can shut down after its
    // replacement has claimed the lock. Deleting it there would let a THIRD
    // worker in — the double, arriving precisely during a restart.
    const fs = fakeFs({ [LOCK]: "333" });
    releaseLock(LOCK, 222, fs);
    expect(fs.files[LOCK]).toBe("333");
  });

  it("does nothing when there is no lock to release", () => {
    const fs = fakeFs();
    expect(() => releaseLock(LOCK, 222, fs)).not.toThrow();
  });
});

describe("the handover a restart performs", () => {
  it("lets the replacement in once the outgoing worker has released", () => {
    const fs = fakeFs();
    acquireLock(LOCK, 100, fs, nobodyAlive);

    // tsx watch restarts the child on a file change: old one still alive.
    expect(acquireLock(LOCK, 200, fs, everybodyAlive)).toEqual({ ok: false, heldBy: 100 });

    releaseLock(LOCK, 100, fs);
    expect(acquireLock(LOCK, 200, fs, everybodyAlive)).toEqual({ ok: true, tookOverStale: false });
    expect(fs.files[LOCK]).toBe("200");
  });
});
