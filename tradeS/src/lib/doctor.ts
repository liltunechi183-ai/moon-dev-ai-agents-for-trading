/**
 * Pure logic for `scripts/doctor.ts` — a setup checklist that helps a human
 * get TradeS running locally without guessing what's missing. Kept
 * dependency-free (no fs/db here) so it's fully unit-testable; the CLI
 * script does the actual file/env probing and feeds this the results.
 */

export type CheckStatus = "ok" | "warn" | "fail";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface NodeVersionInput {
  major: number;
  minVersion: number;
}

/** Next.js 16 needs a reasonably current Node — this is the one hard fail. */
export function checkNodeVersion({ major, minVersion }: NodeVersionInput): CheckResult {
  if (major >= minVersion) {
    return { id: "node", label: "Node.js version", status: "ok", detail: `v${major}.x` };
  }
  return {
    id: "node",
    label: "Node.js version",
    status: "fail",
    detail: `v${major}.x is too old — install Node ${minVersion}+ from nodejs.org`,
  };
}

export function checkNodeModules(exists: boolean): CheckResult {
  return exists
    ? { id: "deps", label: "Dependencies installed", status: "ok", detail: "node_modules/ present" }
    : {
        id: "deps",
        label: "Dependencies installed",
        status: "fail",
        detail: "run: npm install",
      };
}

export function checkEnvFile(exists: boolean): CheckResult {
  return exists
    ? { id: "env", label: ".env.local", status: "ok", detail: "found" }
    : {
        id: "env",
        label: ".env.local",
        status: "warn",
        detail: "not found — run: cp .env.example .env.local (the app still works without it, on delayed data)",
      };
}

export interface AlpacaKeyInput {
  hasKeyId: boolean;
  hasSecretKey: boolean;
}

export function checkAlpacaKeys({ hasKeyId, hasSecretKey }: AlpacaKeyInput): CheckResult {
  if (hasKeyId && hasSecretKey) {
    return { id: "alpaca", label: "Alpaca paper keys", status: "ok", detail: "configured — live US quotes + paper trading enabled" };
  }
  return {
    id: "alpaca",
    label: "Alpaca paper keys",
    status: "warn",
    detail: "not set — dashboard/predictions still work on delayed Yahoo data; Trade/Bot pages stay disabled. Free keys: alpaca.markets/signup",
  };
}

export function checkDatabaseMigrated(hasJobsTable: boolean): CheckResult {
  return hasJobsTable
    ? { id: "db", label: "Database migrated", status: "ok", detail: "schema up to date" }
    : {
        id: "db",
        label: "Database migrated",
        status: "fail",
        detail: "run: npm run db:migrate",
      };
}

export function checkAuthSecret(authEnabled: boolean, secretLength: number): CheckResult {
  if (!authEnabled) {
    return { id: "auth", label: "Auth (logins)", status: "ok", detail: "off (default) — single-user mode" };
  }
  if (secretLength >= 16) {
    return { id: "auth", label: "Auth (logins)", status: "ok", detail: "enabled, AUTH_SECRET looks fine" };
  }
  return {
    id: "auth",
    label: "Auth (logins)",
    status: "fail",
    detail: "AUTH_ENABLED=true but AUTH_SECRET is missing or too short (need >=16 chars)",
  };
}

/** Overall exit-worthiness: any `fail` should make the CLI exit non-zero. */
export function hasFailures(results: CheckResult[]): boolean {
  return results.some((r) => r.status === "fail");
}

const ICONS: Record<CheckStatus, string> = { ok: "✅", warn: "⚠️ ", fail: "❌" };

/** Pure text report (no ANSI colors) so it's easy to test and to pipe. */
export function formatReport(results: CheckResult[]): string {
  const lines = results.map((r) => `${ICONS[r.status]} ${r.label}: ${r.detail}`);
  const failed = results.filter((r) => r.status === "fail").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const summary =
    failed > 0
      ? `\n${failed} thing(s) must be fixed before TradeS will run.`
      : warned > 0
        ? `\nReady to run — ${warned} optional thing(s) noted above (the app degrades gracefully without them).`
        : "\nEverything looks ready. Run: npm run dev:all";
  return [...lines, summary].join("\n");
}
