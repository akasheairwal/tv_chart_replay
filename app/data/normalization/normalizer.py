"""Normalization into the canonical OHLCV schema (architecture ``#17``)."""
from __future__ import annotations

from dataclasses import dataclass, field

import polars as pl

from app.data.models.candle import CANONICAL_COLUMNS, SCHEMA_DTYPES


@dataclass
class NormalizationReport:
    input_rows: int
    output_rows: int
    dropped_unknown_columns: list[str] = field(default_factory=list)
    duplicates_removed: int = 0
    null_timestamps_removed: int = 0


@dataclass
class NormalizationResult:
    frame: pl.DataFrame
    report: NormalizationReport


def normalize(frame: pl.DataFrame) -> NormalizationResult:
    """Producer frames to canonical sorted, deduplicated OHLCV.

    Steps: column selection -> dtype cast -> drop null timestamps -> sort ->
    dedupe by timestamp (keeping the last occurrence).
    """
    input_rows = frame.height
    missing = [c for c in CANONICAL_COLUMNS if c not in frame.columns]
    if missing:
        raise ValueError(f"Missing canonical columns: {missing}")

    unknown = [c for c in frame.columns if c not in CANONICAL_COLUMNS]
    selected = frame.select(
        [pl.col(c).cast(t, strict=False) for c, t in SCHEMA_DTYPES.items()]
    )

    filtered = selected.filter(pl.col("timestamp").is_not_null())
    null_ts = input_rows - filtered.height
    deduped = filtered.unique(subset=["timestamp"], keep="last").sort("timestamp")
    duplicates = filtered.height - deduped.height

    return NormalizationResult(
        frame=deduped,
        report=NormalizationReport(
            input_rows=input_rows,
            output_rows=deduped.height,
            dropped_unknown_columns=unknown,
            duplicates_removed=duplicates,
            null_timestamps_removed=null_ts,
        ),
    )