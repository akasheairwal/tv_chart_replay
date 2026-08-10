"""Shared test doubles for offline data-layer tests."""

from __future__ import annotations

import polars as pl

from app.data.errors import ProviderUnavailableError
from app.data.models.candle import CANONICAL_COLUMNS
from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import Timeframe
from app.data.providers.base import DataProvider, ProgressCallback, ProviderHealth


def make_frame(start_s: int = 1_700_000_000, count: int = 24, step_s: int = 3600) -> pl.DataFrame:
    """A deterministic canonical OHLCV frame."""
    rows = [
        [start_s + i * step_s, 100.0, 105.0, 99.0, 102.0 + i * 0.1, 1000.0 + i]
        for i in range(count)
    ]
    return pl.DataFrame(
        rows,
        schema=[(c, pl.Int64 if c == "timestamp" else pl.Float64) for c in CANONICAL_COLUMNS],
        orient="row",
    )


class FakeProvider(DataProvider):
    """Configurable provider for registry/manager tests (no I/O)."""

    name = "fake"
    priority = 100
    supported_asset_classes = frozenset(AssetClass)

    def __init__(
        self,
        *,
        name: str | None = None,
        priority: int | None = None,
        enabled: bool | None = None,
        frame: pl.DataFrame | None = None,
        failures_before_success: int = 0,
    ) -> None:
        super().__init__(enabled=enabled)
        if name:
            self.name = name
        if priority is not None:
            self.priority = priority
        self.frame = frame if frame is not None else make_frame()
        self.failures_before_success = failures_before_success
        self.download_calls = 0

    def supports_symbol(self, symbol: Symbol) -> bool:
        return True

    def supports_timeframe(self, timeframe: Timeframe) -> bool:
        return True

    def download(
        self,
        symbol: Symbol,
        timeframe: Timeframe,
        start_s: int,
        end_s: int,
        progress: ProgressCallback,
    ) -> pl.DataFrame:
        self.download_calls += 1
        if self.download_calls <= self.failures_before_success:
            progress(0.1, "will fail")
            raise ProviderUnavailableError(f"{self.name} intentionally failing")
        progress(1.0, "done")
        return self.frame

    def health_check(self) -> ProviderHealth:
        return ProviderHealth(healthy=True, detail="fake")


class BrokenProvider(FakeProvider):
    """Always fails; used to verify the fallback path."""

    name = "broken"

    def __init__(
        self,
        *,
        name: str | None = None,
        priority: int | None = None,
        enabled: bool | None = None,
    ) -> None:
        super().__init__(name=name, priority=priority, enabled=enabled)
        self.failures_before_success = 1000


def collect_events() -> tuple[list[tuple[str, dict]], object]:
    """Return ``(events, emit)`` where emit records structured events."""
    events: list[tuple[str, dict]] = []

    def emit(name: str, payload: dict) -> None:
        events.append((name, payload))

    return events, emit
