"""Default constants shared across the application."""

from __future__ import annotations

DEFAULT_TIMEFRAMES: tuple[str, ...] = (
    "1m",
    "2m",
    "3m",
    "5m",
    "10m",
    "15m",
    "30m",
    "45m",
    "1H",
    "2H",
    "4H",
    "6H",
    "12H",
    "1D",
    "1W",
    "1M",
)

SUPPORTED_REPLAY_SPEEDS: tuple[float, ...] = (
    0.25,
    0.5,
    1.0,
    2.0,
    5.0,
    10.0,
    25.0,
    50.0,
    100.0,
)

ASSET_CLASSES: tuple[str, ...] = ("forex", "stock", "index", "futures", "metal", "crypto")

BRIDGE_OBJECT_NAME = "bridge"
