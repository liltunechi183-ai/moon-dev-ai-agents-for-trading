"""
🌙 Moon Dev's Decision Tracker (measurement)
This is what the original bot was missing entirely: proof of whether the AI
has skill. Every AI call is logged with the price at decision time. Later
runs grade matured calls against what the price actually did, and the
accuracy report shows the win rate overall, by action, and by confidence
bucket — so you can see if BUY calls actually go up more than SELL/NOTHING,
and whether high-confidence calls earn their confidence.

The grading MATH is pure and unit-tested. The price lookups are injected, so
this module never imports nice_funcs or needs a network to be tested.
"""

import json
import os
from datetime import datetime, timezone


# ── pure grading math (tested) ─────────────────────────────────────────────

def grade_direction(action, return_pct, neutral_band_pct):
    """A BUY is right when the price went up beyond the band, SELL when it fell
    beyond the band, NOTHING when it stayed inside the band."""
    action = action.upper()
    if action == "BUY":
        return return_pct > neutral_band_pct
    if action == "SELL":
        return return_pct < -neutral_band_pct
    # NOTHING (or anything else) = a bet on staying flat.
    return abs(return_pct) <= neutral_band_pct


def confidence_bucket(confidence):
    if confidence >= 70:
        return "high"
    if confidence >= 40:
        return "mid"
    return "low"


def summarize(graded):
    """graded: list of dicts each with action, confidence, correct(bool),
    return_pct(float). Returns overall + per-action + per-bucket win rates."""
    graded = [g for g in graded if g.get("correct") is not None]
    if not graded:
        return {"graded": 0, "win_rate": None, "by_action": {}, "by_confidence": {}, "avg_return_pct": None}

    def wr(rows):
        return sum(1 for r in rows if r["correct"]) / len(rows) if rows else None

    by_action = {}
    for act in ("BUY", "SELL", "NOTHING"):
        rows = [g for g in graded if g["action"].upper() == act]
        if rows:
            by_action[act] = {"n": len(rows), "win_rate": wr(rows)}

    by_conf = {}
    for b in ("high", "mid", "low"):
        rows = [g for g in graded if confidence_bucket(g["confidence"]) == b]
        if rows:
            by_conf[b] = {"n": len(rows), "win_rate": wr(rows)}

    return {
        "graded": len(graded),
        "win_rate": wr(graded),
        "by_action": by_action,
        "by_confidence": by_conf,
        "avg_return_pct": sum(g["return_pct"] for g in graded) / len(graded),
    }


# ── persistence + orchestration (thin, not unit-tested) ────────────────────

class DecisionTracker:
    def __init__(self, path="paper_data/decisions.json", horizon_minutes=60, neutral_band_pct=3.0, clock=None):
        self.path = path
        self.horizon_minutes = horizon_minutes
        self.neutral_band_pct = neutral_band_pct
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self.rows = self._load()

    def _load(self):
        if os.path.exists(self.path):
            with open(self.path, "r") as f:
                return json.load(f)
        return []

    def save(self):
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        with open(self.path, "w") as f:
            json.dump(self.rows, f, indent=2)

    def log_decision(self, token, action, confidence, price):
        """Record one AI call. Skipped when the price is unknown (can't grade)."""
        if price is None or price <= 0:
            return
        self.rows.append(
            {
                "ts": self._clock().isoformat(),
                "token": token,
                "action": action.upper(),
                "confidence": float(confidence),
                "price_at_decision": float(price),
                "graded_at": None,
                "price_at_horizon": None,
                "return_pct": None,
                "correct": None,
            }
        )
        self.save()

    def grade_matured(self, price_fn):
        """Grade every ungraded decision whose horizon has elapsed. `price_fn`
        is `token -> current_price` (injected so this stays testable)."""
        now = self._clock()
        graded = 0
        for row in self.rows:
            if row["correct"] is not None:
                continue
            decided = datetime.fromisoformat(row["ts"])
            age_min = (now - decided).total_seconds() / 60.0
            if age_min < self.horizon_minutes:
                continue
            try:
                price = price_fn(row["token"])
            except Exception:  # noqa: BLE001 — retry next run
                price = None
            if not price or price <= 0:
                continue
            ret = (price - row["price_at_decision"]) / row["price_at_decision"] * 100.0
            row["price_at_horizon"] = price
            row["return_pct"] = ret
            row["correct"] = grade_direction(row["action"], ret, self.neutral_band_pct)
            row["graded_at"] = now.isoformat()
            graded += 1
        if graded:
            self.save()
        return graded

    def report(self):
        return summarize(self.rows)
