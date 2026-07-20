"""
🌙 Moon Dev's Broker Abstraction
The SINGLE paper/live decision point for the whole bot. The trading agent
talks to a Broker — it never calls nice_funcs execution directly — so paper
mode is impossible to bypass by accident.

Two implementations:
  • PaperBroker  — simulates fills against real prices with fake money.
  • LiveBroker   — wraps nice_funcs.ai_entry / chunk_kill / get_token_balance_usd
                    and moves REAL money on Solana.

get_broker() returns the right one. Going live is deliberately awkward:
config.PAPER_TRADING must be False AND the env var ALLOW_LIVE_TRADING=true
must be set. If either is missing we fall back to paper and say so loudly.
This mirrors the same defense-in-depth idea used in the TradeS project.
"""

import os
from termcolor import cprint

from .config import PAPER_TRADING, PAPER_STARTING_CASH


class PaperBrokerAdapter:
    """Adapts PaperBroker to the Broker interface, fetching live prices for marks."""

    mode = "paper"

    def __init__(self, price_fn):
        # Lazy import so this module stays importable without a Birdeye key.
        from .paper_broker import PaperBroker

        self._price_fn = price_fn
        self._pb = PaperBroker(PAPER_STARTING_CASH)

    def position_usd(self, token):
        price = self._safe_price(token)
        return self._pb.position_usd(token, price) if price else 0.0

    def open_positions(self):
        return self._pb.open_positions()

    def cash(self):
        return self._pb.cash

    def equity(self):
        prices = {t: (self._safe_price(t) or 0.0) for t in self._pb.state["positions"]}
        return self._pb.equity(prices)

    def buy(self, token, usd_amount):
        price = self._safe_price(token)
        ok, reason = self._pb.buy(token, usd_amount, price)  # auto-persists on fill
        if ok:
            cprint(f"📝 [PAPER] bought ${usd_amount:.2f} of {token[:4]} @ {price}", "white", "on_green")
        else:
            cprint(f"📝 [PAPER] buy skipped for {token[:4]}: {reason}", "white", "on_yellow")
        return ok, reason

    def close(self, token):
        price = self._safe_price(token)
        ok, realized = self._pb.sell_all(token, price)  # auto-persists on fill
        if ok:
            cprint(f"📝 [PAPER] closed {token[:4]} @ {price} — realized ${realized:+.2f}", "white", "on_cyan")
        return ok, realized

    def _safe_price(self, token):
        try:
            return self._price_fn(token)
        except Exception as e:  # noqa: BLE001 — price source is best-effort
            cprint(f"⚠️ [PAPER] price fetch failed for {token[:4]}: {e}", "white", "on_yellow")
            return None


class LiveBrokerAdapter:
    """Moves REAL money via nice_funcs. Only reachable through the triple check
    in get_broker()."""

    mode = "live"

    def __init__(self):
        from ..core import nice_funcs as n  # lazy: needs a Birdeye key at import

        self._n = n

    def position_usd(self, token):
        return self._n.get_token_balance_usd(token)

    def open_positions(self):
        # Live positions are read per-token by the agent via position_usd.
        return []

    def cash(self):
        from .config import USDC_ADDRESS

        return self._n.get_token_balance_usd(USDC_ADDRESS)

    def equity(self):
        return self.cash()

    def buy(self, token, usd_amount):
        self._n.ai_entry(token, usd_amount)
        return True, "submitted on-chain"

    def close(self, token):
        from .config import max_usd_order_size, slippage

        self._n.chunk_kill(token, max_usd_order_size, slippage)
        return True, 0.0


def live_trading_unlocked():
    """Both locks must be open: the config flag AND the env override."""
    env_ok = os.getenv("ALLOW_LIVE_TRADING", "").lower() == "true"
    return (not PAPER_TRADING) and env_ok


def get_broker(price_fn=None):
    """Return the broker the bot should use. Defaults to paper unless BOTH
    live locks are open. `price_fn(token) -> price` is required for paper marks;
    if omitted we use nice_funcs.token_price (lazy)."""
    if live_trading_unlocked():
        cprint("🔴 LIVE TRADING ENABLED — real money will move on Solana!", "white", "on_red")
        return LiveBrokerAdapter()

    if not PAPER_TRADING:
        cprint(
            "🟡 config.PAPER_TRADING is False but ALLOW_LIVE_TRADING env is not 'true' — "
            "staying on PAPER for safety.",
            "white",
            "on_yellow",
        )
    else:
        cprint("🟢 PAPER TRADING — fake money, real prices. No chain writes.", "white", "on_green")

    if price_fn is None:
        def price_fn(token):
            from ..core import nice_funcs as n

            return n.token_price(token)

    return PaperBrokerAdapter(price_fn)
