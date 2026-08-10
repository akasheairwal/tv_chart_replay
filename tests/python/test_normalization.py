"""Normalizer + resampler tests."""

from __future__ import annotations

import polars as pl
import pytest

from app.data.models.timeframe import H1, M1, M5
from app.data.normalization.normalizer import normalize
from app.data.normalization.resampler import resample

BASE = 1_699_999_200  # aligned 1h/5m/1m grid (00:00 UTC boundary)


def _minute_frame(count: int) -> pl.DataFrame:
    rows = [[BASE + i * 60, 100.0 + i, 105.0 + i, 99.0 + i, 102.0 + i, 10.0] for i in range(count)]
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


def test_normalize_sorts_and_dedupes() -> None:
    frame = pl.concat(
        [
            _minute_frame(3),
            _minute_frame(2),  # overlapping duplicate timestamps
        ]
    )
    result = normalize(frame)
    stamp = result.frame["timestamp"].to_list()
    assert stamp == sorted(stamp)
    assert len(stamp) == len(set(stamp))
    assert result.report.duplicates_removed == 2
    assert result.report.input_rows == 5


def test_normalize_keeps_last_duplicate() -> None:
    frame = _minute_frame(2)
    duplicated = pl.concat([frame, frame])
    result = normalize(duplicated)
    assert result.frame.height == 2


def test_normalize_missing_columns_raises() -> None:
    with pytest.raises(ValueError, match="Missing canonical columns"):
        normalize(_minute_frame(2).drop("volume"))


def test_normalize_report_unknown_columns() -> None:
    frame = _minute_frame(1).with_columns(pl.lit(1).alias("extra"))
    result = normalize(frame)
    assert result.report.dropped_unknown_columns == ["extra"]


def test_resample_minutes_to_five() -> None:
    frame = _minute_frame(5)
    out = resample(frame, M1, M5)
    assert out.height == 1
    row = out.row(0)
    assert row[0] == BASE  # bucket start
    assert row[1] == 100.0  # open of first
    assert row[2] == max(105.0 + i for i in range(5))  # high
    assert row[3] == min(99.0 + i for i in range(5))  # low
    assert row[4] == 102.0 + 4  # close of last
    assert row[5] == 50.0  # summed volume


def test_resample_hour_from_minutes() -> None:
    frame = _minute_frame(120)
    out = resample(frame, M1, H1)
    assert out.height == 2
    assert out["volume"].to_list() == [600.0, 600.0]


def test_resample_keeps_original_for_equal_target() -> None:
    frame = _minute_frame(3)
    out = resample(frame, M5, M5)
    assert out.height == 3


def test_resample_rejects_finer_target() -> None:
    with pytest.raises(ValueError, match="target is finer"):
        resample(_minute_frame(60), H1, M5)


def test_resample_empty_input() -> None:
    empty = _minute_frame(0)
    out = resample(empty, M1, M5)
    assert out.height == 0
