// Setup checklist for running TradeS locally: `npx tsx scripts/doctor.ts`
// (or `npm run doctor`). Checks Node version, dependencies, .env.local,
// Alpaca keys, and whether the database is migrated — then prints a clear
// checklist with exact next-step commands. Never modifies anything.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
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
} from "../src/lib/doctor";

const ROOT = path.resolve(__dirname, "..");
const MIN_NODE_MAJOR = 20;

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function checkDbMigrated(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false;
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'")
        .get();
      return Boolean(row);
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

function main() {
  const envPath = path.join(ROOT, ".env.local");
  const envVars = parseEnvFile(envPath);
  const dbPath = path.resolve(ROOT, envVars.DATABASE_PATH || "./data/trades.db");

  const results: CheckResult[] = [
    checkNodeVersion({ major: Number(process.versions.node.split(".")[0]), minVersion: MIN_NODE_MAJOR }),
    checkNodeModules(existsSync(path.join(ROOT, "node_modules"))),
    checkEnvFile(existsSync(envPath)),
    checkAlpacaKeys({
      hasKeyId: Boolean(envVars.ALPACA_KEY_ID),
      hasSecretKey: Boolean(envVars.ALPACA_SECRET_KEY),
    }),
    checkDatabaseMigrated(checkDbMigrated(dbPath)),
    checkAuthSecret(envVars.AUTH_ENABLED === "true", (envVars.AUTH_SECRET || "").length),
  ];

  console.log("TradeS setup check\n" + "=".repeat(19) + "\n");
  console.log(formatReport(results));
  console.log("\nNot sure what these mean? See tradeS/README.md and the How-to page in the app.");

  process.exit(hasFailures(results) ? 1 : 0);
}

main();
