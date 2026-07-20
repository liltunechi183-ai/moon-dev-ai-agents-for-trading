"""
🌙 Moon Dev's Sentiment Agent
The roadmap's "Sentiment Collection Agent". The roadmap imagines pulling
sentiment from Twitter/Discord/Telegram — but those need API keys and
scraping infra you may not have yet. So this ships with a keyless, honest
default: a PRICE-ACTION sentiment PROXY computed from the same OHLCV the bot
already has, plus a pluggable interface so real social sources can be added
later without touching the trading agent.

score() is PURE (no pandas, no network): it takes plain lists of closes and
volumes and returns a score in [-1, 1] with a human label. Neutral when the
data is too thin to judge. This is clearly a PROXY, not real crowd sentiment
— it is labeled as such everywhere so it is never mistaken for the real thing.
"""

from dataclasses import dataclass


@dataclass
class Sentiment:
    score: float          # -1 (very bearish) .. +1 (very bullish)
    label: str            # human-readable bucket
    source: str           # which source produced it
    detail: str = ""      # short explanation


def _mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def price_action_sentiment(closes, volumes=None) -> Sentiment:
    """Keyless proxy from recent price + volume behaviour.

    Combines three cheap signals, each clamped, then averaged:
      • short-term return (last close vs ~1/3 of the window back)
      • trend agreement (last close vs the window mean)
      • volume expansion (recent volume vs earlier volume) as a conviction tilt
    """
    closes = [c for c in (closes or []) if c is not None]
    if len(closes) < 4:
        return Sentiment(0.0, "neutral", "price-action-proxy", "not enough data")

    look = max(1, len(closes) // 3)
    recent = closes[-1]
    past = closes[-1 - look] if len(closes) > look else closes[0]
    ret = (recent - past) / past if past else 0.0
    # A 10% move over the window maps to a full-strength signal.
    ret_signal = _clamp(ret / 0.10, -1, 1)

    window_mean = _mean(closes)
    trend_signal = _clamp(((recent - window_mean) / window_mean if window_mean else 0.0) / 0.05, -1, 1)

    base = 0.6 * ret_signal + 0.4 * trend_signal

    # Volume expansion amplifies conviction in the SAME direction as `base`;
    # it never flips the sign, it only scales it.
    if volumes:
        vols = [v for v in volumes if v is not None]
        if len(vols) >= 4:
            half = len(vols) // 2
            early = _mean(vols[:half]) or 1e-9
            late = _mean(vols[half:])
            expansion = _clamp((late - early) / early, -1, 1)  # +1 = volume doubled+
            base *= 1.0 + 0.3 * max(0.0, expansion)  # only expansion boosts conviction
            base = _clamp(base, -1, 1)

    return Sentiment(round(base, 3), _label(base), "price-action-proxy", f"{ret * 100:+.1f}% over window")


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def _label(score):
    if score >= 0.5:
        return "very bullish"
    if score >= 0.15:
        return "bullish"
    if score <= -0.5:
        return "very bearish"
    if score <= -0.15:
        return "bearish"
    return "neutral"


# ── pluggable source interface ─────────────────────────────────────────────
# Add real social sources by writing a callable `source(token) -> Sentiment`
# and passing it to combined_sentiment(). Each source degrades gracefully:
# if it raises or returns None, it is skipped. This mirrors how the TradeS
# project's data sources degrade into a "Data Gaps" section instead of
# crashing the run.

def combined_sentiment(token, ohlcv_closes, ohlcv_volumes=None, extra_sources=()):
    """Blend the keyless price-action proxy with any extra social sources.

    `extra_sources` is an iterable of callables `source(token) -> Sentiment|None`.
    Returns a single averaged Sentiment. With no extra sources this is just the
    price-action proxy — honest about being a proxy."""
    parts = [price_action_sentiment(ohlcv_closes, ohlcv_volumes)]
    used = ["price-action-proxy"]

    for src in extra_sources:
        try:
            s = src(token)
        except Exception:  # noqa: BLE001 — a flaky source must not break the run
            s = None
        if s is not None:
            parts.append(s)
            used.append(s.source)

    avg = _mean([p.score for p in parts])
    return Sentiment(round(avg, 3), _label(avg), "+".join(used), f"blended {len(parts)} source(s)")
