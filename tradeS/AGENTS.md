This project pins Next.js 16 (App Router), which has real breaking changes vs.
older training data (middleware renamed to `src/proxy.ts`, some APIs moved).
Before writing any Next-specific code, read `node_modules/next/dist/docs/` and
trust those docs over memory.

Never set `ANTHROPIC_API_KEY` in this project's environment. The AI research
engine runs on the machine's Claude Code subscription login; that env var
silently switches the Agent SDK to per-token API billing instead.
`guardAnthropicKey()` in `src/lib/env.ts` deletes it at worker boot — keep
that call first, before any AI-related import.
