"""Future data protection and isolation layer (architecture ``#32``/``#34``/``#80``).

Ensures that future market data is strictly blocked in Python memory and never
accessible to the chart, indicator engines, strategy simulators, or bridge events.
"""
from __future__ import annotations

from typing import Any

import polars as pl

from app.data.models.candle import CANONICAL_COLUMNS


class FutureDataLeakageError(RuntimeError):
    """Raised when an operation attempts to read beyond the active replay boundary."""


class IsolatedDataset:
    """Encapsulates historical data with strict forward-access boundaries."""

    def __init__(self, frame: pl.DataFrame) -> None:
        if frame.height == 0:
            raise ValueError("Cannot initialize replay with an empty dataset")
        self._frame = frame.select(CANONICAL_COLUMNS).sort("timestamp")
        self._total_candles = self._frame.height

    @property
    def total_candles(self) -> int:
        return self._total_candles

    def timestamp_at(self, index: int) -> int:
        self._assert_bounds(index)
        return int(self._frame["timestamp"][index])

    def candle_at(self, index: int) -> list[Any]:
        self._assert_bounds(index)
        row = self._frame.row(index)
        return list(row)

    def slice_visible(self, current_index: int) -> pl.DataFrame:
        """Return visible history up to and including ``current_index``.
        
        Future data (`index > current_index`) is strictly isolated and excluded.
        """
        self._assert_bounds(current_index)
        return self._frame.slice(0, current_index + 1)

    def visible_rows(self, current_index: int) -> list[list[Any]]:
        """Return visible history as compact arrays `[[t, o, h, l, c, v], ...]`.
        
        Length of returned list is strictly `current_index + 1`.
        """
        self._assert_bounds(current_index)
        visible = self._frame.slice(0, current_index + 1)
        return [list(r) for r in visible.iter_rows()]

    def _assert_bounds(self, index: int) -> None:
        if index < 0:
            raise IndexError(f"Negative replay index not allowed: {index}")
        if index >= self._total_candles:
            raise FutureDataLeakageError(
                f"Attempted to access future candle at index {index}; dataset length is {self._total_candles}"
            )
