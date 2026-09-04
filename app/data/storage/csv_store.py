"""CSV export / import (interchange only; Parquet is primary, ``#21``)."""
from __future__ import annotations

from pathlib import Path

import polars as pl

from app.data.models.candle import CANONICAL_COLUMNS, SCHEMA_DTYPES

CSV_COLUMNS = ("timestamp", "open", "high", "low", "close", "volume")


def export_csv(path: Path, frame: pl.DataFrame) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.select(CSV_COLUMNS).write_csv(str(path))
    return path.stat().st_size


def read_csv(path: Path) -> pl.DataFrame:
    """Import a CSV (with a header row) into the canonical schema."""
    raw = pl.read_csv(str(path))
    renamed = raw.rename(
        {c: c.lower() for c in raw.columns if c.lower() in CANONICAL_COLUMNS}
    )
    missing = [c for c in CANONICAL_COLUMNS if c not in renamed.columns]
    if missing:
        raise ValueError(f"CSV is missing canonical columns: {missing}")
    return renamed.select(
        [pl.col(c).cast(t, strict=False) for c, t in SCHEMA_DTYPES.items()]
    )