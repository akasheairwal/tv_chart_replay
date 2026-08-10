"""Validator, gap detector and duplicate detection tests."""

from __future__ import annotations

from datetime import UTC, datetime

import polars as pl
import pytest

from app.data.models.symbol import AssetClass
from app.data.models.timeframe import D1, H1
from app.data.validation.duplicate_detector import duplicate_count
from app.data.validation.gap_detector import detect_gaps
from app.data.validation.validator import ValidationStatus, validate


def _epoch(year: int, month: int, day: int, hour: int = 0) -> int:
    return int(datetime(year, month, day, hour, tzinfo=UTC).timestamp())


def _frame(timestamps: list[int]) -> pl.DataFrame:
    rows = [[t, 100.0, 105.0, 99.0, 102.0, 10.0] for t in timestamps]
    return pl.DataFrame(
        rows,
        schema=[
            ("timestamp", pl.Int64),
            ("open", pl.Float64),
            ("high", pl.Float64),
            ("low", pl.Float64),
            ("close", pl.Float64),
            ("volume", pl.Float64),
        ],
        orient="row",
    )


def test_valid_dataset() -> None:
    frame = _frame([_epoch(2023, 1, 2, i) for i in range(5)])
    clean, report = validate(frame)
    assert report.status == ValidationStatus.VALID
    assert report.quarantined_rows == 0
    assert clean.height == 5


def test_bad_row_is_quarantined() -> None:
    frame = _frame([_epoch(2023, 1, 2), _epoch(2023, 1, 3), _epoch(2023, 1, 4)])
    frame = frame.with_columns(
        pl.when(pl.col("timestamp") == _epoch(2023, 1, 3))
        .then(pl.lit(50.0))  # high < open => structural violation
        .otherwise(pl.col("high"))
        .alias("high")
    )
    clean, report = validate(frame)
    assert report.quarantined_rows == 1
    assert report.status == ValidationStatus.WARN
    assert clean.height == 2
    assert report.issues and report.issues[0].code == "invalid_row"


def test_nan_row_quarantined() -> None:
    frame = _frame([_epoch(2023, 1, 2), _epoch(2023, 1, 3)])
    frame = frame.with_columns(
        pl.when(pl.col("timestamp") == _epoch(2023, 1, 2))
        .then(pl.lit(float("nan")))
        .otherwise(pl.col("close"))
        .alias("close")
    )
    _, report = validate(frame)
    assert report.quarantined_rows == 1


def test_mostly_invalid_rejects() -> None:
    frame = _frame([_epoch(2023, 1, 2 + i) for i in range(4)])
    frame = frame.with_columns(pl.lit(-5.0).alias("volume"))
    clean, report = validate(frame)
    assert report.status == ValidationStatus.INVALID
    assert clean.height == 0


def test_duplicate_count() -> None:
    frame = _frame([1000, 1000, 2000, 3000, 3000])
    assert duplicate_count(frame) == 2


### gap detector


def test_crypto_continuous_no_gaps() -> None:
    start = _epoch(2023, 3, 4, 12)  # Saturday
    frame = _frame([start + i * 3600 for i in range(5)])
    report = detect_gaps(frame, H1, AssetClass.CRYPTO)
    assert report.suspicious == []


def test_crypto_gap_is_suspicious() -> None:
    start = _epoch(2023, 3, 4, 12)
    frame = _frame([start, start + 4 * 3600])
    report = detect_gaps(frame, H1, AssetClass.CRYPTO)
    assert len(report.suspicious) == 1


def test_stock_weekend_gap_expected() -> None:
    frame = _frame([_epoch(2023, 3, 3, 15), _epoch(2023, 3, 6, 10)])  # Fri -> Mon
    report = detect_gaps(frame, H1, AssetClass.STOCK)
    assert report.suspicious == []


def test_stock_intraday_gap_suspicious() -> None:
    frame = _frame([_epoch(2023, 3, 2, 10), _epoch(2023, 3, 2, 12)])  # same Thursday
    report = detect_gaps(frame, H1, AssetClass.STOCK)
    assert len(report.suspicious) == 1


def test_daily_weekend_gap_expected() -> None:
    frame = _frame([_epoch(2023, 3, 3), _epoch(2023, 3, 6)])  # daily Fri -> Mon
    report = detect_gaps(frame, D1, AssetClass.STOCK)
    assert report.suspicious == []


@pytest.mark.parametrize("asset_class", list(AssetClass))
def test_continuous_frame_never_flags(asset_class) -> None:
    start = _epoch(2023, 3, 6, 9)  # Monday
    frame = _frame([start + i * 3600 for i in range(6)])
    report = detect_gaps(frame, H1, asset_class)
    assert report.suspicious == []
