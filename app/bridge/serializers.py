"""Bridge serialization helpers.

Initial utilities; the data-layer serializers land with Wave 1 and are
consumed through this module so the wire format stays centralized.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any


def to_epoch_seconds(dt: datetime) -> int:
    """Naive datetimes are assumed UTC (architecture ``#18``)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return int(dt.timestamp())


def to_iso_utc(dt: datetime) -> str:
    """ISO-8601 UTC string for event payloads."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat()


def is_finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def compact_candles(rows: list[list[Any]]) -> list[list[Any]]:
    """Compact ``[[time, o, h, l, c, v], ...]`` transfer form.

    Kept as a single normalization point for the wire format specified in
    ``docs/bridge-contract.md``.
    """
    return [
        [int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])] for r in rows
    ]
