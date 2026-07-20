"""Tests for the paper broker — fake money, real prices, no network."""
import os
import tempfile

from src.core.paper_broker import PaperBroker


def _broker(cash=100.0):
    tmp = tempfile.mkdtemp()
    return PaperBroker(cash, state_path=os.path.join(tmp, "p.json"), clock=lambda: "t")


def test_buy_reduces_cash_and_opens_position():
    b = _broker(100)
    ok, reason = b.buy("TOK", 30, price=2.0)
    assert ok, reason
    assert b.cash == 70
    assert b.position_qty("TOK") == 15  # 30 / 2.0
    assert b.position_usd("TOK", 2.0) == 30


def test_buy_refuses_when_cash_insufficient():
    b = _broker(10)
    ok, reason = b.buy("TOK", 30, price=2.0)
    assert not ok
    assert "insufficient" in reason
    assert b.cash == 10  # unchanged


def test_buy_refuses_invalid_price():
    b = _broker()
    assert not b.buy("TOK", 10, price=0)[0]
    assert not b.buy("TOK", 10, price=None)[0]


def test_sell_all_realizes_pnl_and_returns_cash():
    b = _broker(100)
    b.buy("TOK", 40, price=2.0)          # 20 units
    ok, realized = b.sell_all("TOK", price=3.0)  # sell 20 @ 3 = 60
    assert ok
    assert round(realized, 6) == 20.0    # 60 proceeds - 40 cost
    assert round(b.cash, 6) == 120.0     # 60 left + 60 proceeds
    assert b.position_qty("TOK") == 0


def test_sell_all_on_empty_position_is_noop():
    b = _broker()
    ok, realized = b.sell_all("TOK", price=3.0)
    assert not ok
    assert realized == 0.0


def test_equity_marks_positions_at_given_prices():
    b = _broker(100)
    b.buy("A", 20, price=1.0)  # 20 units
    b.buy("B", 30, price=3.0)  # 10 units
    # cash now 50; A marked at 2.0 -> 40, B at 3.0 -> 30
    assert b.equity({"A": 2.0, "B": 3.0}) == 50 + 40 + 30


def test_averaging_into_a_position():
    b = _broker(100)
    b.buy("TOK", 20, price=2.0)  # 10 units @ 2
    b.buy("TOK", 20, price=4.0)  # 5 units @ 4 -> 15 units, cost 40
    assert b.position_qty("TOK") == 15
    assert round(b.state["positions"]["TOK"]["avg_price"], 4) == round(40 / 15, 4)


def test_state_persists_across_instances():
    tmp = tempfile.mkdtemp()
    path = os.path.join(tmp, "p.json")
    b1 = PaperBroker(100, state_path=path, clock=lambda: "t")
    b1.buy("TOK", 25, price=5.0)
    b2 = PaperBroker(100, state_path=path, clock=lambda: "t")
    assert b2.cash == 75
    assert b2.position_qty("TOK") == 5
