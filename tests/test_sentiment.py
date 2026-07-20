"""Tests for the keyless price-action sentiment proxy."""
from src.agents.sentiment import price_action_sentiment, combined_sentiment, Sentiment


def test_neutral_when_data_too_thin():
    s = price_action_sentiment([1.0, 2.0])
    assert s.score == 0.0
    assert s.label == "neutral"


def test_rising_prices_are_bullish():
    closes = [1.0, 1.05, 1.10, 1.15, 1.20, 1.25]
    s = price_action_sentiment(closes)
    assert s.score > 0.15
    assert "bull" in s.label


def test_falling_prices_are_bearish():
    closes = [1.25, 1.20, 1.15, 1.10, 1.05, 1.0]
    s = price_action_sentiment(closes)
    assert s.score < -0.15
    assert "bear" in s.label


def test_score_is_clamped_to_unit_range():
    closes = [1.0, 2.0, 4.0, 8.0, 16.0, 32.0]  # explosive up
    s = price_action_sentiment(closes)
    assert -1.0 <= s.score <= 1.0


def test_volume_expansion_only_amplifies_never_flips():
    closes = [1.0, 1.05, 1.10, 1.15, 1.20, 1.25]
    quiet = price_action_sentiment(closes, [10, 10, 10, 10, 10, 10])
    loud = price_action_sentiment(closes, [5, 5, 5, 20, 20, 20])
    assert loud.score >= quiet.score  # expansion boosts conviction, same sign
    assert loud.score > 0


def test_combined_blends_extra_sources_and_skips_failures():
    closes = [1.0, 1.05, 1.10, 1.15, 1.20, 1.25]

    def good_source(_token):
        return Sentiment(-1.0, "very bearish", "twitter-mock")

    def broken_source(_token):
        raise RuntimeError("api down")

    blended = combined_sentiment("TOK", closes, extra_sources=[good_source, broken_source])
    # price-action is bullish (~>0), twitter-mock is -1 -> blend lands between.
    assert -1.0 <= blended.score <= 1.0
    assert "twitter-mock" in blended.source
    # broken source did not crash the blend.
    assert "price-action-proxy" in blended.source


def test_combined_with_no_extra_sources_is_just_the_proxy():
    closes = [1.0, 1.05, 1.10, 1.15, 1.20, 1.25]
    blended = combined_sentiment("TOK", closes)
    assert blended.source == "price-action-proxy"
