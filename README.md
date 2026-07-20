# 🤖 AI AGENTS FOR TRADING

[![Moon Dev](moondev.png)](https://www.moondev.com/)

**⚠️ IMPORTANT: This is an experimental project. There are NO guarantees of profitability. Trading involves substantial risk of loss.**

This project explores the potential of [artificial financial intelligence](https://www.afi.xyz) - a focused implementation of AI for trading and investing research.

## 🛡️ Safety upgrade — Paper mode, a risk agent, and measurement

The trading agent now runs in **paper mode by default** (fake money, real
prices) and only measures itself against reality. Nothing here changes the
disclaimers below — it just makes the bot safe to *evaluate* before risking a
cent. What was added:

- **`PAPER_TRADING = True`** (in `src/core/config.py`) is the single
  paper/live switch. Every buy/sell routes through a **broker abstraction**
  (`src/core/broker.py`), so the agent never calls the chain directly. Going
  live is deliberately awkward: you must set `PAPER_TRADING = False` **and**
  export `ALLOW_LIVE_TRADING=true`. Miss either and it stays on paper.
- **Risk agent** (`src/agents/risk.py`, previously empty) — a pure pre-trade
  gate: minimum confidence, per-position cap, cash buffer, max open positions,
  a daily-loss circuit breaker, and a per-token cooldown. Every buy passes it
  first; it can shrink an order to fit the caps or block it with a reason.
- **Sentiment agent** (`src/agents/sentiment.py`, previously empty) — a
  keyless price-action sentiment *proxy* with a pluggable interface for real
  social feeds later. Honestly labeled as a proxy, never as real crowd data.
- **Measurement** (`src/core/tracker.py`) — the thing the bot was missing:
  every AI call is logged with the price at decision time, graded against what
  the price actually did, and reported as a win rate **by action and by
  confidence** each run. This is how you find out whether the AI has real
  skill instead of trusting its self-reported confidence.

Run it, watch the accuracy report for a few weeks on paper, and let the
numbers — not hope — decide whether it's ever worth real money.

```bash
pip install -r requirements.txt
cp ".env example" .env      # add ANTHROPIC_KEY (+ BIRDEYE_API_KEY for live data)
python -m src.main          # starts in PAPER mode by default
python -m pytest tests/     # unit tests for the risk/paper/tracker logic
```

⚠️ This bot trades **Solana memecoins**, one of the highest-risk asset
classes that exists. Paper mode does not make the strategy profitable — it
only lets you find out safely.

## 🎯 Vision
We're researching AI agents for trading that may eventually leverage [AFI](https://www.afi.xyz). With 4 years of experience training humans through our [bootcamp](https://algotradecamp.com), we're exploring where AI agents might complement human trading operations. This is experimental research, not a profitable trading solution.

## 💡 Concept
AI agents might help address common trading challenges:
- Emotional reactions
- Ego-driven decisions
- Inconsistent execution
- Fatigue effects
- Impatience
- Fear & Greed cycles

While we use the RBI framework for strategy research, we're exploring AI agents as potential tools. We're in early stages with LLM technology, investigating possibilities in the trading space.

## 🗺️ Research Roadmap

### 1. Risk Control Agents
Exploring AI agents that could assist with risk management. This is purely experimental research into risk oversight possibilities.

### 2. Exit Agents
Researching potential exit timing assistance. This overlaps with risk management research but focuses on position management concepts.

### 3. Entry Agents
Investigating entry-focused concepts after risk management research.

### 4. Sentiment Collection Agents
Exploring ways to gather market sentiment from Twitter, Discord, and Telegram for research purposes.

### 5. Strategy Execution Agents
Researching concepts like:
- Multi-agent consensus
- Strategy validation
- Dynamic trade filtering

## ⚠️ Critical Disclaimers

**PLEASE READ CAREFULLY:**

1. This is an experimental research project, NOT a trading system
2. There are NO plug-and-play solutions for guaranteed profits
3. We do NOT provide trading strategies
4. Success depends entirely on YOUR:
   - Trading strategy
   - Risk management
   - Market research
   - Testing and validation
   - Overall trading approach

5. NO AI agent can guarantee profitable trading
6. You MUST develop and validate your own trading approach
7. Trading involves substantial risk of loss
8. Past performance does not indicate future results

## 👂 Looking for Updates?
Project updates will be posted on [moondev.com](http://moondev.com) in the AI Agents for Trading Section.

## 📜 Detailed Disclaimer
The content presented is for educational and informational purposes only and does not constitute financial advice. All trading involves risk and may not be suitable for all investors. You should carefully consider your investment objectives, level of experience, and risk appetite before investing.

Past performance is not indicative of future results. There is no guarantee that any trading strategy or algorithm discussed will result in profits or will not incur losses.

**CFTC Disclaimer:** Commodity Futures Trading Commission (CFTC) regulations require disclosure of the risks associated with trading commodities and derivatives. There is a substantial risk of loss in trading and investing.

I am not a licensed financial advisor or a registered broker-dealer. Content & code is based on personal research perspectives and should not be relied upon as a guarantee of success in trading.

## 🔗 Links
- Trading Education: [https://algotradecamp.com](https://algotradecamp.com)
- Business

---
*Built with love by Moon Dev - Pioneering the future of AI-powered trading*

