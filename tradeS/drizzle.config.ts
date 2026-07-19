import type { Config } from "drizzle-kit";

const dbPath = process.env.DATABASE_PATH || "./data/trades.db";

export default {
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
