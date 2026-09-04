"""Timeframe model (canonical frequency representation).

Conventions (architecture ``#25``): intraday minutes use lowercase ``m``
(``1m``, ``5m``), hours/weeks/days/months use uppercase (``1H``, ``1D``,
``1W``, ``1M``).  This keeps ``m`` vs ``M`` unambiguous.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

SUPPORTED_TIMEFRAMES = frozenset(
    {
        "1m", "2m", "3m", "5m", "10m", "15m", "30m", "45m",
        "1H", "2H", "4H", "6H", "12H", "1D", "1W", "1M",
    }
)

# Canonical unit -> minutes (M approximates 30 days).
_UNIT_MINUTES = {"m": 1, "H": 60, "D": 1440, "W": 10080, "M": 43200}
# Canonical unit -> polars Duration code.
_UNIT_POLARS = {"m": "m", "H": "h", "D": "d", "W": "w", "M": "mo"}

_PATTERN = re.compile(r"^(\d+)([mHDWM])$")


@dataclass(frozen=True)
class Timeframe:
    """Small, validated timeframe value object."""

    freq: str

    def __post_init__(self) -> None:
        value = self.freq.strip()
        match = _PATTERN.match(value)
        if not match:
            raise ValueError(f"Invalid timeframe: {self.freq!r}")
        number, unit = int(match.group(1)), match.group(2)
        canonical = f"{number}{unit}"
        if canonical not in SUPPORTED_TIMEFRAMES:
            raise ValueError(f"Unsupported timeframe: {canonical!r}")
        object.__setattr__(self, "freq", canonical)

    @classmethod
    def parse(cls, value: str) -> Timeframe:
        return cls(value)

    @property
    def number(self) -> int:
        """The numeric multiplier of the frequency."""
        return int(re.match(r"^(\d+)", self.freq).group(1))

    @property
    def unit(self) -> str:
        return self.freq[-1]

    @property
    def minutes(self) -> int:
        return self.number * _UNIT_MINUTES[self.unit]

    @property
    def seconds(self) -> int:
        return self.minutes * 60

    @property
    def is_intraday(self) -> bool:
        return self.unit in ("m", "H")

    def polars_every(self) -> str:
        """Polars duration string for resampling, e.g. ``1mo`` or ``5m``."""
        return f"{self.number}{_UNIT_POLARS[self.unit]}"

    def __str__(self) -> str:
        return self.freq

    def __repr__(self) -> str:
        return f"Timeframe({self.freq!r})"


# Convenience constants for common timeframes.
M1 = Timeframe("1m")
M5 = Timeframe("5m")
M15 = Timeframe("15m")
H1 = Timeframe("1H")
H4 = Timeframe("4H")
D1 = Timeframe("1D")
W1 = Timeframe("1W")
MONTH1 = Timeframe("1M")

# Valid timeframe strings exported for UI dropdowns.
TIMEFRAME_STRINGS = tuple(sorted(SUPPORTED_TIMEFRAMES, key=lambda f: Timeframe(f).seconds))