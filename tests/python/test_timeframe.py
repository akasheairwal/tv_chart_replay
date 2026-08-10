"""Timeframe model tests."""

from __future__ import annotations

import pytest

from app.data.models.timeframe import (
    D1,
    H1,
    M1,
    M5,
    SUPPORTED_TIMEFRAMES,
    TIMEFRAME_STRINGS,
    Timeframe,
)


def test_parse_minutes() -> None:
    tf = Timeframe.parse("5m")
    assert tf.freq == "5m"
    assert tf.minutes == 5
    assert tf.seconds == 300
    assert tf.polars_every() == "5m"


def test_parse_hour() -> None:
    tf = Timeframe("1H")
    assert tf.seconds == 3600
    assert tf.polars_every() == "1h"
    assert tf.is_intraday


def test_parse_day_week_month() -> None:
    assert D1.seconds == 86400
    assert Timeframe("1W").seconds == 604800
    month = Timeframe("1M")
    assert month.minutes == 43200
    assert month.polars_every() == "1mo"
    assert not month.is_intraday


def test_case_distinguishes_minute_vs_month() -> None:
    assert M1 != Timeframe("1M")
    assert Timeframe("1m").seconds == 60


def test_unsupported_raises() -> None:
    with pytest.raises(ValueError):
        Timeframe("7m")
    with pytest.raises(ValueError):
        Timeframe("3X")
    with pytest.raises(ValueError):
        Timeframe.parse("")


def test_supported_set_matches_doc() -> None:
    assert SUPPORTED_TIMEFRAMES == {
        "1m",
        "2m",
        "3m",
        "5m",
        "10m",
        "15m",
        "30m",
        "45m",
        "1H",
        "2H",
        "4H",
        "6H",
        "12H",
        "1D",
        "1W",
        "1M",
    }
    assert "1H" in TIMEFRAME_STRINGS
    assert M5.seconds < H1.seconds
