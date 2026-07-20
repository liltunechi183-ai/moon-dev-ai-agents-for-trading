"""
🌙 Moon Dev's Risk Agent
The pre-trade safety gate — the roadmap's #1 "Risk Control Agent", now real.

check_trade() is a PURE function (no network, no nice_funcs import) so it is
fully unit-testable. The trading agent calls it before every entry and only
buys when it returns allow=True. It enforces, in order:

  1. minimum AI confidence
  2. do-not-trade list
  3. per-token cooldown after a recent close (anti-overtrading)
  4. max number of open positions
  5. daily-loss circuit breaker (halts new buys once down enough on the day)
  6. per-position cap (% of equity)
  7. cash buffer (keep a minimum % in USDC)

Anything that fails returns a clear reason so the bot can log WHY it passed.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class RiskInputs:
    token: str
    confidence: float            # 0-100 from the AI
    proposed_usd: float          # size we want to buy
    equity_usd: float            # total portfolio value
    cash_usd: float              # free USDC
    current_position_usd: float  # existing exposure in this token
    open_position_count: int     # how many tokens currently held
    day_start_equity: float      # equity at the start of the trading day
    minutes_since_last_close: Optional[float]  # None = no recent close for this token


@dataclass
class RiskLimits:
    min_confidence: float
    max_open_positions: int
    max_daily_loss_usd: float
    cooldown_minutes: float
    max_position_pct: float      # 0-100
    cash_buffer_pct: float       # 0-100
    do_not_trade: tuple = ()


@dataclass
class RiskDecision:
    allow: bool
    reason: str
    approved_usd: float = 0.0    # may be shrunk to fit the caps


def check_trade(inp: RiskInputs, lim: RiskLimits) -> RiskDecision:
    """Decide whether (and how much of) a proposed buy may proceed."""
    if inp.confidence < lim.min_confidence:
        return RiskDecision(False, f"confidence {inp.confidence:.0f} < min {lim.min_confidence:.0f}")

    if inp.token in lim.do_not_trade:
        return RiskDecision(False, "token is on the do-not-trade list")

    if inp.minutes_since_last_close is not None and inp.minutes_since_last_close < lim.cooldown_minutes:
        return RiskDecision(
            False,
            f"cooldown: closed {inp.minutes_since_last_close:.0f}m ago (need {lim.cooldown_minutes:.0f}m)",
        )

    # Opening a NEW position when already at the cap is blocked (adding to an
    # existing one is fine).
    is_new = inp.current_position_usd <= 0
    if is_new and inp.open_position_count >= lim.max_open_positions:
        return RiskDecision(False, f"already holding {inp.open_position_count} positions (max {lim.max_open_positions})")

    day_loss = inp.day_start_equity - inp.equity_usd
    if day_loss >= lim.max_daily_loss_usd:
        return RiskDecision(
            False, f"daily-loss circuit breaker: down ${day_loss:.2f} (limit ${lim.max_daily_loss_usd:.2f})"
        )

    if inp.equity_usd <= 0:
        return RiskDecision(False, "no equity")

    # Per-position cap: total exposure in this token can't exceed the cap.
    max_position_usd = inp.equity_usd * (lim.max_position_pct / 100.0)
    room_in_position = max_position_usd - inp.current_position_usd
    if room_in_position <= 0:
        return RiskDecision(False, f"position already at the {lim.max_position_pct:.0f}% cap")

    # Cash buffer: never spend below the reserve.
    reserve = inp.equity_usd * (lim.cash_buffer_pct / 100.0)
    spendable_cash = inp.cash_usd - reserve
    if spendable_cash <= 0:
        return RiskDecision(False, f"cash buffer: keeping {lim.cash_buffer_pct:.0f}% in USDC")

    approved = min(inp.proposed_usd, room_in_position, spendable_cash)
    if approved <= 0:
        return RiskDecision(False, "no room after caps and buffer")

    shrunk = approved < inp.proposed_usd - 1e-9
    reason = "approved" + (f" (shrunk to ${approved:.2f} to fit caps)" if shrunk else "")
    return RiskDecision(True, reason, approved_usd=approved)


def limits_from_config(config) -> RiskLimits:
    """Build RiskLimits from the project config module."""
    return RiskLimits(
        min_confidence=getattr(config, "MIN_CONFIDENCE_TO_TRADE", 60),
        max_open_positions=getattr(config, "MAX_OPEN_POSITIONS", 3),
        max_daily_loss_usd=getattr(config, "MAX_DAILY_LOSS_USD", 15.0),
        cooldown_minutes=getattr(config, "COOLDOWN_MINUTES_AFTER_CLOSE", 10),
        max_position_pct=getattr(config, "MAX_POSITION_PERCENTAGE", 30),
        cash_buffer_pct=getattr(config, "CASH_PERCENTAGE", 20),
        do_not_trade=tuple(getattr(config, "DO_NOT_TRADE_LIST", []) or []),
    )
