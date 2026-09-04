import gc
import hashlib
import os
import time
import uuid
from pathlib import Path

import polars as pl

from app.data.models.candle import CANONICAL_COLUMNS, empty_frame


def _safe_replace(src: Path, dst: Path, max_retries: int = 5) -> None:
    for attempt in range(max_retries):
        try:
            os.replace(src, dst)
            return
        except OSError:
            if attempt == max_retries - 1:
                # Give up atomically: copying over a locked destination
                # in-place could corrupt the previously good file.
                try:
                    src.unlink(missing_ok=True)
                except OSError:
                    pass
                raise
            gc.collect()
            time.sleep(0.1)


def write_dataframe(path: Path, frame: pl.DataFrame) -> int:
    """Write a canonical frame to Parquet; returns file size in bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".tmp_{uuid.uuid4().hex}_{path.name}")
    frame.select(CANONICAL_COLUMNS).write_parquet(
        str(tmp_path), compression="zstd", row_group_size=50_000
    )
    _safe_replace(tmp_path, path)
    return path.stat().st_size


def read_range(
    path: Path,
    start_s: int | None = None,
    end_s: int | None = None,
    columns: list[str] | None = None,
) -> pl.DataFrame:
    """Lazy windowed read with predicate pushdown (#65)."""
    if not path.exists():
        raise FileNotFoundError(path)

    if columns:
        missing = [c for c in columns if c not in CANONICAL_COLUMNS]
        if missing:
            raise ValueError(f"Unknown columns requested: {missing}")

    # True predicate and projection pushdown via Polars lazy scan engine
    lf = pl.scan_parquet(str(path))
    if start_s is not None:
        lf = lf.filter(pl.col("timestamp") >= int(start_s))
    if end_s is not None:
        lf = lf.filter(pl.col("timestamp") <= int(end_s))
    if columns:
        lf = lf.select(columns)
    return lf.collect()


def read_all(path: Path, columns: list[str] | None = None) -> pl.DataFrame:
    return read_range(path, columns=columns)


def compute_checksum(path: Path, chunk_size: int = 1 << 20) -> str:
    """SHA-256 of the Parquet file bytes."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def empty_canonical() -> pl.DataFrame:
    return empty_frame()