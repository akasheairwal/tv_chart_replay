"""DataProvider interface (architecture ``#10``)."""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass

import polars as pl

from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import Timeframe

#: ``(fraction 0..1, message)`` progress callback passed to providers.
ProgressCallback = Callable[[float, str], None]


@dataclass(frozen=True)
class ProviderHealth:
    healthy: bool
    latency_ms: float = 0.0
    detail: str = ""


class DataProvider(ABC):
    name: str = ""
    enabled: bool = True
    priority: int = 0
    supported_asset_classes: frozenset[AssetClass] = frozenset()

    def __init__(self, *, enabled: bool | None = None) -> None:
        if enabled is not None:
            self.enabled = enabled

    @abstractmethod
    def supports_symbol(self, symbol: Symbol) -> bool:
        """Whether this provider can serve the canonical symbol."""

    @abstractmethod
    def supports_timeframe(self, timeframe: Timeframe) -> bool:
        """Whether this provider can serve the timeframe."""

    def available_range(self, symbol: Symbol, timeframe: Timeframe) -> tuple[int, int] | None:
        """Known ``(start_s, end_s)`` coverage; ``None`` when unknown."""
        return None

    @abstractmethod
    def download(
        self,
        symbol: Symbol,
        timeframe: Timeframe,
        start_s: int,
        end_s: int,
        progress: ProgressCallback,
    ) -> pl.DataFrame:
        """Fetch ``[start_s, end_s]`` into a canonical-OHLCV frame."""

    def health_check(self) -> ProviderHealth:
        """Quick liveness probe; default assumes healthy."""
        return ProviderHealth(healthy=True, detail="no probe")

    def __repr__(self) -> str:
        return (
            f"<{type(self).__name__} name={self.name} enabled={self.enabled} "
            f"priority={self.priority}>"
        )