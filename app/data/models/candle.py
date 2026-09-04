"""Canonical OHLCV column contract (architecture ``#18``)."""
from __future__ import annotations

import polars as pl

#: Canonical column order, used end-to-end (storage, bridge, indicators).
CANONICAL_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]

#: Parquet schema version written into dataset metadata.
SCHEMA_VERSION = "1.0"

SCHEMA_DTYPES: dict[str, pl.DataType] = {
    "timestamp": pl.Int64,
    "open": pl.Float64,
    "high": pl.Float64,
    "low": pl.Float64,
    "close": pl.Float64,
    "volume": pl.Float64,
}


def cast_canonical(frame: pl.DataFrame) -> pl.DataFrame:
    """Cast a frame to the canonical schema, in canonical column order."""
    if set(CANONICAL_COLUMNS) - set(frame.columns):
        raise ValueError("Frame is missing canonical columns")
    return frame.select([pl.col(c).cast(t, strict=False) for c, t in SCHEMA_DTYPES.items()])


def empty_frame() -> pl.DataFrame:
    """An empty frame with the canonical schema (useful for providers)."""
    return pl.DataFrame({c: pl.Series(c, [], t) for c, t in SCHEMA_DTYPES.items()})