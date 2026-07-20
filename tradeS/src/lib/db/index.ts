import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath = resolve(process.env.DATABASE_PATH || "./data/trades.db");

function openDb() {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return drizzle(sqlite, { schema });
}

declare global {
  var __tradesDb__: ReturnType<typeof openDb> | undefined;
}

export const db = globalThis.__tradesDb__ ?? openDb();

if (process.env.NODE_ENV !== "production") {
  globalThis.__tradesDb__ = db;
}

export const tables = schema;
