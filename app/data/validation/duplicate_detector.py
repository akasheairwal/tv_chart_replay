"""Duplicate detection on canonical datasets."""
from __future__ import annotations

import polars as pl


def find_duplicates(frame: pl.DataFrame) -> pl.DataFrame:
    """All rows whose ``timestamp`` appears more than once (each copy)."""
    return frame.filter(pl.col("timestamp").is_duplicated()).sort("timestamp")


def duplicate_count(frame: pl.DataFrame) -> int:
    """Number of distinct timestamps that appear more than once."""
    if frame.height == 0:
        return 0
    counts = frame.select("timestamp").group_by("timestamp").len()
    return int(counts.filter(pl.col("len") > 1).height)