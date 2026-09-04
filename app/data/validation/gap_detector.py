"""Session-aware gap detection (architecture ``#20``).

Not every gap is an error: weekends (forex/equities), overnight sessions
and suspension periods are expected; gaps inside an active session point
at data problems.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import polars as pl

from app.data.models.symbol import AssetClass
from app.data.models.timeframe import Timeframe


@dataclass
class GapIssue:
    prev_timestamp: int
    timestamp: int
    expected_seconds: int
    observed_seconds: int
    expected_gap: bool


@dataclass
class GapReport:
    issues: list[GapIssue] = field(default_factory=list)

    @property
    def suspicious(self) -> list[GapIssue]:
        return [g for g in self.issues if not g.expected_gap]


def detect_gaps(
    frame: pl.DataFrame, timeframe: Timeframe | str, asset_class: AssetClass | str
) -> GapReport:
    """Detect gaps larger than the expected spacing between candles."""
    if not isinstance(timeframe, Timeframe):
        timeframe = Timeframe.parse(timeframe)
    if isinstance(asset_class, str):
        asset_class = AssetClass(asset_class)

    expected = timeframe.seconds
    threshold = max(expected * 1.5, 2)

    timestamps = frame.select(pl.col("timestamp").cast(pl.Int64)).to_series().to_list()
    issues: list[GapIssue] = []

    previous: int | None = None
    for ts in timestamps:
        if previous is not None:
            observed = ts - previous
            if observed > threshold:
                is_expected = _is_expected_gap(asset_class, timeframe, previous, ts)
                if not is_expected:
                    issues.append(
                        GapIssue(previous, ts, expected, observed, expected_gap=False)
                    )
        previous = ts

    return GapReport(issues=issues)


def _is_expected_gap(
    asset_class: AssetClass, timeframe: Timeframe, prev_seconds: int, next_seconds: int
) -> bool:
    if asset_class == AssetClass.CRYPTO:
        return False  # 24/7 markets: any gap is a data problem

    # Daily/weekly/monthly frames routinely skip calendar periods.
    if not timeframe.is_intraday:
        return True

    previous = datetime.fromtimestamp(prev_seconds, UTC)
    following = datetime.fromtimestamp(next_seconds, UTC)
    days_between = (following.date() - previous.date()).days

    # Overnight session break: market closes in the evening and reopens the
    # next calendar day (e.g. equities/futures 20:00 UTC -> 13:30 UTC).
    if days_between == 1 and previous.hour >= 17 and following.hour <= 14:
        return True
    if days_between >= 2 and _spans_weekend(previous, following):
        return True
    if following.weekday() == 0 and previous.weekday() >= 4:
        return True
    return days_between >= 3  # plausible long suspension / exchange holiday block


def _spans_weekend(previous: datetime, following: datetime) -> bool:
    day = previous
    for _ in range(10):
        day = day + timedelta(days=1)
        if day.weekday() >= 5 and day.date() < following.date():
            return True
        if day.date() >= following.date():
            break
    return False