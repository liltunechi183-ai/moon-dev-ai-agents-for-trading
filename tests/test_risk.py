"""Tests for the pre-trade risk gate."""
from src.agents.risk import RiskInputs, RiskLimits, check_trade


def _lim(**over):
    base = dict(
        min_confidence=60,
        max_open_positions=3,
        max_daily_loss_usd=15.0,
        cooldown_minutes=10,
        max_position_pct=30,
        cash_buffer_pct=20,
        do_not_trade=(),
    )
    base.update(over)
    return RiskLimits(**base)


def _inp(**over):
    base = dict(
        token="TOK",
        confidence=80,
        proposed_usd=10,
        equity_usd=100,
        cash_usd=100,
        current_position_usd=0,
        open_position_count=0,
        day_start_equity=100,
        minutes_since_last_close=None,
    )
    base.update(over)
    return RiskInputs(**base)


def test_clean_trade_is_approved():
    d = check_trade(_inp(), _lim())
    assert d.allow
    assert d.approved_usd == 10


def test_low_confidence_blocked():
    d = check_trade(_inp(confidence=55), _lim())
    assert not d.allow
    assert "confidence" in d.reason


def test_do_not_trade_list_blocked():
    d = check_trade(_inp(), _lim(do_not_trade=("TOK",)))
    assert not d.allow
    assert "do-not-trade" in d.reason


def test_cooldown_blocks_recent_reentry():
    d = check_trade(_inp(minutes_since_last_close=3), _lim(cooldown_minutes=10))
    assert not d.allow
    assert "cooldown" in d.reason
    # ...but allowed once the cooldown has elapsed
    assert check_trade(_inp(minutes_since_last_close=11), _lim(cooldown_minutes=10)).allow


def test_max_open_positions_blocks_new_but_allows_adding():
    # New position blocked at the cap.
    d = check_trade(_inp(open_position_count=3), _lim(max_open_positions=3))
    assert not d.allow
    # Adding to an existing position is still allowed.
    d2 = check_trade(_inp(open_position_count=3, current_position_usd=5), _lim(max_open_positions=3))
    assert d2.allow


def test_daily_loss_circuit_breaker():
    d = check_trade(_inp(equity_usd=84, day_start_equity=100), _lim(max_daily_loss_usd=15))
    assert not d.allow
    assert "circuit breaker" in d.reason


def test_per_position_cap_shrinks_or_blocks():
    # Already at the 30% cap -> blocked.
    d = check_trade(_inp(current_position_usd=30), _lim(max_position_pct=30))
    assert not d.allow
    # Room for only $5 more -> approved amount shrunk to 5.
    d2 = check_trade(_inp(proposed_usd=10, current_position_usd=25), _lim(max_position_pct=30))
    assert d2.allow
    assert round(d2.approved_usd, 6) == 5.0
    assert "shrunk" in d2.reason


def test_cash_buffer_respected():
    # equity 100, buffer 20% -> reserve 20; only $10 cash means spendable 0 -> block... wait cash=10
    d = check_trade(_inp(cash_usd=15, equity_usd=100), _lim(cash_buffer_pct=20))
    assert not d.allow
    assert "buffer" in d.reason


def test_approved_amount_never_exceeds_proposal():
    d = check_trade(_inp(proposed_usd=8), _lim())
    assert d.approved_usd <= 8
