/**
 * Every model choice in the app, in one file.
 *
 * These run on the machine's Claude Code subscription login, not per-token
 * API billing (see AGENTS.md). That has a consequence worth stating: a
 * *preview* model can carry its own, much smaller usage-credit pool than
 * the plan's main models. Pinning a preview model here means that feature —
 * and only that feature — starts failing with "You're out of usage credits"
 * while everything else keeps working, which is a confusing thing to debug.
 *
 * So: pin generally-available models. If you reach for a preview model,
 * make it a deliberate, commented exception.
 */

/** Deep reasoning: predictions, backtest sims, the discovery scan, the
 * challenge chat, and the self-improvement strategist. */
export const REASONING_MODEL = "claude-opus-4-8";

/** Short, mechanical, high-volume work where latency matters more than
 * depth: translations, post-mortems, rule suggestions. */
export const FAST_MODEL = "claude-haiku-4-5";
