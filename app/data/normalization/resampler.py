"""OHLCV resampling to higher timeframes (architecture ``#26``)."""
from __future__ import annotations

import polars as pl

from app.data.models.candle import CANONICAL_COLUMNS
from app.data.models.timeframe import Timeframe


def resample(frame: pl.DataFrame, source: Timeframe | str, target: Timeframe | str) -> pl.DataFrame:
    """Aggregate ``frame`` from ``source`` to ``target`` timeframe.

    ``open`` = first, ``high`` = max, ``low`` = min, ``close`` = last,
    ``volume`` = sum.  The first/last partial window is kept.
    """

    if not isinstance(source, Timeframe):
        source = Timeframe.parse(source)
    if not isinstance(target, Timeframe):
        target = Timeframe.parse(target)

    if target.seconds < source.seconds:
        raise ValueError(f"Cannot resample {source} up to {target}: target is finer than source")

    fused = frame.select(CANONICAL_COLUMNS).sort("timestamp")
    if fused.height == 0 or source == target:
        return fused

    with_times = fused.with_columns(
        pl.from_epoch(pl.col("timestamp"), time_unit="s").alias("__dt")
    )

    aggregated = (
        with_times.group_by_dynamic(
            index_column="__dt",
            every=target.polars_every(),
            period=target.polars_every(),
            closed="left",
            label="left",
        )
        .agg(
            pl.col("open").first(),
            pl.col("high").max(),
            pl.col("low").min(),
            pl.col("close").last(),
            pl.col("volume").sum(),
        )
        .sort("__dt")
    )

    return aggregated.select(
        pl.col("__dt").dt.epoch("s").cast(pl.Int64).alias("timestamp"),
        pl.col("open"),
        pl.col("high"),
        pl.col("low"),
        pl.col("close"),
        pl.col("volume"),
    )