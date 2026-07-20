"""
🌙 Moon Dev's Paper Broker
A simulated portfolio that fills orders against REAL prices but with FAKE
money. This is the safety net: run the bot on paper for weeks, then read
tracker.py's accuracy report to see if the AI actually has skill — all
without risking a cent.

Pure Python (no pandas, no network) so it is fully unit-testable. Prices are
passed IN by the caller (the live price comes from nice_funcs.token_price in
the real bot); this module never fetches anything itself.
"""

import json
import os
from datetime import datetime, timezone


class PaperBroker:
    """A JSON-file-backed simulated portfolio.

    State shape:
        {
          "cash": float,                       # USDC buffer
          "positions": {token: {"usd_cost": float, "qty": float, "avg_price": float}},
          "realized_pnl": float,
          "trades": [ {ts, token, side, usd, price, qty}, ... ]
        }
    """

    def __init__(self, starting_cash, state_path="paper_data/portfolio.json", clock=None):
        self.state_path = state_path
        self._clock = clock or (lambda: datetime.now(timezone.utc).isoformat())
        self.state = self._load(starting_cash)

    # ── persistence ────────────────────────────────────────────────────────
    def _load(self, starting_cash):
        if os.path.exists(self.state_path):
            with open(self.state_path, "r") as f:
                return json.load(f)
        return {"cash": float(starting_cash), "positions": {}, "realized_pnl": 0.0, "trades": []}

    def save(self):
        os.makedirs(os.path.dirname(self.state_path) or ".", exist_ok=True)
        with open(self.state_path, "w") as f:
            json.dump(self.state, f, indent=2)

    # ── reads ──────────────────────────────────────────────────────────────
    @property
    def cash(self):
        return self.state["cash"]

    def position_qty(self, token):
        return self.state["positions"].get(token, {}).get("qty", 0.0)

    def position_usd(self, token, price):
        """Current mark-to-market value of a token position at `price`."""
        return self.position_qty(token) * price

    def open_positions(self):
        return [t for t, p in self.state["positions"].items() if p.get("qty", 0.0) > 0]

    def equity(self, prices):
        """Total portfolio value = cash + every position marked at `prices`.
        `prices` is a dict {token: price}; missing prices mark that position at 0."""
        total = self.state["cash"]
        for token, pos in self.state["positions"].items():
            total += pos.get("qty", 0.0) * prices.get(token, 0.0)
        return total

    # ── writes ─────────────────────────────────────────────────────────────
    def buy(self, token, usd_amount, price):
        """Simulate a market buy of `usd_amount` worth of `token` at `price`.
        Returns (ok, reason). Refuses if price invalid or cash insufficient."""
        if price is None or price <= 0:
            return False, "no valid price"
        if usd_amount <= 0:
            return False, "non-positive amount"
        if usd_amount > self.state["cash"] + 1e-9:
            return False, f"insufficient paper cash (${self.state['cash']:.2f} < ${usd_amount:.2f})"

        qty = usd_amount / price
        pos = self.state["positions"].get(token, {"usd_cost": 0.0, "qty": 0.0, "avg_price": 0.0})
        new_qty = pos["qty"] + qty
        new_cost = pos["usd_cost"] + usd_amount
        pos["qty"] = new_qty
        pos["usd_cost"] = new_cost
        pos["avg_price"] = new_cost / new_qty if new_qty > 0 else 0.0
        self.state["positions"][token] = pos
        self.state["cash"] -= usd_amount
        self._log("buy", token, usd_amount, price, qty)
        self.save()  # persist every fill so a crash never loses state
        return True, "filled"

    def sell_all(self, token, price):
        """Simulate closing the whole `token` position at `price`.
        Returns (ok, realized_pnl_usd)."""
        pos = self.state["positions"].get(token)
        if not pos or pos.get("qty", 0.0) <= 0:
            return False, 0.0
        if price is None or price <= 0:
            return False, 0.0

        qty = pos["qty"]
        proceeds = qty * price
        realized = proceeds - pos["usd_cost"]
        self.state["cash"] += proceeds
        self.state["realized_pnl"] += realized
        self._log("sell", token, proceeds, price, qty)
        # Position fully closed.
        self.state["positions"][token] = {"usd_cost": 0.0, "qty": 0.0, "avg_price": 0.0}
        self.save()  # persist every fill so a crash never loses state
        return True, realized

    def _log(self, side, token, usd, price, qty):
        self.state["trades"].append(
            {"ts": self._clock(), "token": token, "side": side, "usd": usd, "price": price, "qty": qty}
        )
