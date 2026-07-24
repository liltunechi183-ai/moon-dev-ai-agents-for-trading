import { describe, it, expect } from "vitest";
import {
  checkNodeVersion,
  checkNodeModules,
  checkEnvFile,
  checkAlpacaKeys,
  checkDatabaseMigrated,
  checkAuthSecret,
  hasFailures,
  formatReport,
  type CheckResult,
} from "@/lib/doctor";

describe("checkNodeVersion", () => {
  it("passes on a current version", () => {
    expect(checkNodeVersion({ major: 22, minVersion: 20 }).status).toBe("ok");
  });
  it("fails on an old version with an actionable message", () => {
    const r = checkNodeVersion({ major: 16, minVersion: 20 });
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("nodejs.org");
  });
});

describe("checkNodeModules", () => {
  it("ok when present, fail with the install command when missing", () => {
    expect(checkNodeModules(true).status).toBe("ok");
    const r = checkNodeModules(false);
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("npm install");
  });
});

describe("checkEnvFile", () => {
  it("warns (not fails) when .env.local is missing — the app still runs", () => {
    const r = checkEnvFile(false);
    expect(r.status).toBe("warn");
  });
  it("ok when present", () => {
    expect(checkEnvFile(true).status).toBe("ok");
  });
});

describe("checkAlpacaKeys", () => {
  it("ok only when both key id and secret are set", () => {
    expect(checkAlpacaKeys({ hasKeyId: true, hasSecretKey: true }).status).toBe("ok");
    expect(checkAlpacaKeys({ hasKeyId: true, hasSecretKey: false }).status).toBe("warn");
    expect(checkAlpacaKeys({ hasKeyId: false, hasSecretKey: false }).status).toBe("warn");
  });
});

describe("checkDatabaseMigrated", () => {
  it("fails with the migrate command when the schema is missing", () => {
    const r = checkDatabaseMigrated(false);
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("db:migrate");
  });
  it("ok when migrated", () => {
    expect(checkDatabaseMigrated(true).status).toBe("ok");
  });
});

describe("checkAuthSecret", () => {
  it("ok when auth is off regardless of secret", () => {
    expect(checkAuthSecret(false, 0).status).toBe("ok");
  });
  it("fails when auth is on with a short/missing secret", () => {
    expect(checkAuthSecret(true, 5).status).toBe("fail");
  });
  it("ok when auth is on with a long enough secret", () => {
    expect(checkAuthSecret(true, 32).status).toBe("ok");
  });
});

describe("hasFailures / formatReport", () => {
  const results: CheckResult[] = [
    { id: "a", label: "A", status: "ok", detail: "fine" },
    { id: "b", label: "B", status: "warn", detail: "optional" },
  ];

  it("hasFailures is false with only ok/warn", () => {
    expect(hasFailures(results)).toBe(false);
  });

  it("hasFailures is true when any result failed", () => {
    expect(hasFailures([...results, { id: "c", label: "C", status: "fail", detail: "broken" }])).toBe(true);
  });

  it("formatReport lists every result and a ready summary with no failures", () => {
    const report = formatReport(results);
    expect(report).toContain("A: fine");
    expect(report).toContain("B: optional");
    expect(report).toContain("Ready to run");
  });

  it("formatReport calls out failures distinctly", () => {
    const report = formatReport([...results, { id: "c", label: "C", status: "fail", detail: "broken" }]);
    expect(report).toContain("must be fixed");
  });

  it("formatReport says everything is ready when there are zero warnings or failures", () => {
    const report = formatReport([{ id: "a", label: "A", status: "ok", detail: "fine" }]);
    expect(report).toContain("npm run dev:all");
  });
});
