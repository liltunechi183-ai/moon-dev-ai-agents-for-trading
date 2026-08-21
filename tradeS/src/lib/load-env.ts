/**
 * Environment loading for the non-Next processes (the worker and the CLI
 * scripts). Import this for its side effect, before anything that reads
 * `process.env` — `import "@/lib/load-env";` as the first import.
 *
 * Why it exists: the Next.js app loads `.env.local` by itself, and the whole
 * project documents `.env.local` as the place to put your keys (README,
 * `.env.example`, `npm run doctor`, `npm run alpaca:keys`). But
 * `dotenv/config` — what these processes used before — reads only `.env`,
 * so the worker silently ran with no Alpaca keys no matter what you put in
 * `.env.local`.
 *
 * Precedence matches Next: `.env.local` wins over `.env`. dotenv never
 * overwrites a variable that is already set, so loading `.env.local` first
 * gives it priority, and real environment variables beat both.
 */
import path from "node:path";
import { config } from "dotenv";

const ROOT = path.resolve(__dirname, "../..");

config({ path: path.join(ROOT, ".env.local") });
config({ path: path.join(ROOT, ".env") });
