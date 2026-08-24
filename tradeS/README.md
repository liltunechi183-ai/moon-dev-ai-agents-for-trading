# TradeS

A single-machine, personal stock-research tool: an LLM+quant hybrid that
predicts stocks, paper-trades them through Alpaca, runs an autonomous bot,
and improves its own strategy over time — with proof that each change helped
and a human gate on anything touching money.

> **Decision-support research, NOT financial advice.** Every prediction and
> trade view says so. Optimized for correctness and honesty about
> uncertainty, never for routing real money by accident.

This lives in the `tradeS/` subdirectory of the repo so it stays separate
from the unrelated Python project at the repo root.

## Stack

Next.js 16 (App Router) + React 19, better-sqlite3 + Drizzle, the Claude
Agent SDK for the research engine, a hand-rolled Alpaca REST/WebSocket
client, `yahoo-finance2` for delayed/international data, `lightweight-charts`
v5, Tailwind CSS v4. Two processes share one SQLite file: the Next.js web app
and a background `worker/` that owns all live feeds, cron jobs, the AI job
queue, and the trading bot.

## Quick start

```bash
cd tradeS
npm install
cp .env.example .env.local     # fill in Alpaca paper keys (optional to start)
npm run db:migrate             # create/upgrade the SQLite schema
npm run dev:all                # web app (:3100) + worker together
```

Open http://localhost:3100. With **no keys at all** the app still works on
delayed Yahoo data (no trading). Add free Alpaca **paper** keys to enable
live US quotes and paper trading — `npm run alpaca:keys` prompts for them
and writes them into `.env.local` for you, so there's no dotfile to
hand-edit.

Something else already on :3100? Set `PORT` — `PORT=3200 npm run dev:all`
serves the app on http://localhost:3200 instead. (Port 3100 is also
Grafana Loki's default, so a collision is not unusual.)

Not sure something's set up right? Run `npm run doctor` — it checks your
Node version, dependencies, `.env.local`, Alpaca keys, and whether the
database is migrated, then prints exactly what's missing and the command to
fix it.

**Never set `ANTHROPIC_API_KEY`** — the AI engine runs on the machine's
Claude Code login; that env var silently switches the SDK to per-token API
billing. `guardAnthropicKey()` deletes it at worker boot.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:all` | web app + worker (main dev command) |
| `npm run dev` / `npm run worker` | either half alone |
| `npm run build` / `npm start` | production build / serve on :3100 |
| `npm test` | Vitest unit suites (the pure logic) |
| `npm run db:generate` / `npm run db:migrate` | Drizzle migrations |
| `npm run doctor` | checks your setup (Node, deps, env, keys, DB) and tells you what to fix |
| `npm run alpaca:keys` | prompts for your Alpaca paper keys and writes them into `.env.local` |
| `npx tsx scripts/research-once.ts AAPL` | one research run from the terminal |
| `npx tsx scripts/strategist-once.ts` | run the self-improvement strategist once |
| `npx tsx scripts/primer-salto-study.ts` | backtest the "Primer Salto" checklist across ~60 symbols, with an in/out-of-sample split |
| `npx tsx scripts/primer-salto-sweep.ts` | stop width vs sizing method — the two disagree, and that is the point |

## What's inside (by page)

- **Dashboard** — holdings (manual entry) + watchlist, live P/L.
- **Stock** — candlesticks with MA overlays, quant signals, the AI prediction
  + challenge chat + history.
- **Predictions** — the accuracy panel (measured win rate vs SPY and dumb
  baselines), lessons learned, per-symbol prediction cards.
- **Discoveries** — the weekly dark-horse scout's review inbox
  (approve/dismiss, graded either way).
- **Trade** — a paper order ticket, positions, orders, equity curve.
- **Bot** — rule builder, safeguards, realized stats, activity feed, and the
  KILL SWITCH. Live trading needs a deliberate triple unlock.
- **Strategy** — the self-improvement engine: active playbook, the challenger
  under test with its scorecard, the version timeline, and the daily budget.
- **How-to** — a plain-language guide to all of the above.

## Primer Salto

A mechanical, long-only checklist (prior downtrend → RSI exhaustion → close
back above both the 20 and 40-day means → confirming jump bar), run by
`worker/primer-salto-runner.ts` once a day at 15:50 ET over the 69 symbols in
`src/lib/study/universe.ts`. Entries carry a bracket priced from the signal
bar — stop at `low − 1.0×ATR`, target at 3R — plus a 20-session time exit the
broker cannot express. Every entry records the regime, RSI, ATR and stop
distance it fired under; nothing filters on them yet, but the question
"did this work better in a bull market?" can only be answered later if the
answer was written down at the time.

It runs BESIDE the AI rule engine, not through it: that engine gates on a
fresh prediction, which this strategy neither has nor needs. Separate switch
on the Bot page, same safeguards, separate books — so the two can be compared
rather than confused.

`npx tsx scripts/primer-salto-study.ts` re-runs the backtest behind it
(`--loose` drops the exhaustion filter, `--symbols` narrows the universe,
`--wide` swaps the 69-symbol core for a ~350-name candidate pool). Candidates
are admitted by two mechanical tests — enough history, and enough median
dollar volume to actually get filled — so which names join is decided by the
data rather than by whoever wrote the list. Both lists share one flaw worth
stating: they contain companies that still exist, so any result over them is
optimistic by the amount survivorship is worth.

## Adding a language

i18n is config-driven. Append one `{ code, label }` entry to
`SUPPORTED_LANGUAGES` in `src/lib/i18n/config.ts` and add a
`src/lib/i18n/dict/<code>/` folder (copy the `en` files and translate, or
leave gaps and rely on fallback). Machine text (AI theses, lessons) then
translates itself on demand via the cache — no schema or prompt changes.
