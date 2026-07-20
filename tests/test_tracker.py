"""Tests for the decision tracker's pure grading math + orchestration."""
import os
import tempfile
from datetime import datetime, timedelta, timezone

from src.core.tracker import grade_direction, confidence_bucket, summarize, DecisionTracker


def test_grade_direction_buy_sell_nothing():
    band = 3.0
    assert grade_direction("BUY", 5, band) is True
    assert grade_direction("BUY", 1, band) is False       # inside band, not up enough
    assert grade_direction("SELL", -5, band) is True
    assert grade_direction("SELL", 1, band) is False
    assert grade_direction("NOTHING", 2, band) is True     # stayed flat
    assert grade_direction("NOTHING", 8, band) is False


def test_confidence_bucket_thresholds():
    assert confidence_bucket(75) == "high"
    assert confidence_bucket(50) == "mid"
    assert confidence_bucket(20) == "low"


def test_summarize_empty():
    r = summarize([])
    assert r["graded"] == 0
    assert r["win_rate"] is None


def test_summarize_computes_win_rates_by_action_and_confidence():
    graded = [
        {"action": "BUY", "confidence": 80, "correct": True, "return_pct": 10},
        {"action": "BUY", "confidence": 80, "correct": False, "return_pct": -2},
        {"action": "SELL", "confidence": 30, "correct": True, "return_pct": -5},
        {"action": "NOTHING", "confidence": 50, "correct": None, "return_pct": None},  # excluded
    ]
    r = summarize(graded)
    assert r["graded"] == 3
    assert round(r["win_rate"], 4) == round(2 / 3, 4)
    assert r["by_action"]["BUY"]["n"] == 2
    assert r["by_action"]["BUY"]["win_rate"] == 0.5
    assert r["by_confidence"]["high"]["n"] == 2
    assert r["by_confidence"]["low"]["win_rate"] == 1.0


def test_tracker_logs_and_grades_after_horizon():
    tmp = tempfile.mkdtemp()
    path = os.path.join(tmp, "d.json")
    now = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    tr = DecisionTracker(path=path, horizon_minutes=60, neutral_band_pct=3.0, clock=lambda: now[0])

    tr.log_decision("TOK", "BUY", 80, price=100.0)

    # Not matured yet -> nothing graded.
    now[0] = datetime(2026, 1, 1, 0, 30, tzinfo=timezone.utc)
    assert tr.grade_matured(lambda _t: 110.0) == 0

    # After the horizon -> graded; price up 10% so BUY is correct.
    now[0] = datetime(2026, 1, 1, 1, 5, tzinfo=timezone.utc)
    assert tr.grade_matured(lambda _t: 110.0) == 1
    assert tr.rows[0]["correct"] is True
    assert round(tr.rows[0]["return_pct"], 4) == 10.0


def test_tracker_skips_logging_without_price():
    tmp = tempfile.mkdtemp()
    tr = DecisionTracker(path=os.path.join(tmp, "d.json"))
    tr.log_decision("TOK", "BUY", 80, price=None)
    tr.log_decision("TOK", "BUY", 80, price=0)
    assert tr.rows == []
