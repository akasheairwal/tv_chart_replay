"""Provider registry: ranking and fallback (architecture ``#11``/``#12``)."""
from __future__ import annotations

from collections.abc import Iterable

from app.data.models.symbol import Symbol
from app.data.models.timeframe import Timeframe
from app.data.providers.base import DataProvider


class ProviderRegistry:
    def __init__(self, providers: Iterable[DataProvider] | None = None) -> None:
        self._providers: list[DataProvider] = []
        if providers:
            for provider in providers:
                self.register(provider)

    def register(self, provider: DataProvider) -> None:
        existing = [p for p in self._providers if p.name == provider.name]
        if existing:
            self._providers.remove(existing[0])
        self._providers.append(provider)

    def all(self) -> list[DataProvider]:
        return list(self._providers)

    def get(self, name: str) -> DataProvider | None:
        return next((p for p in self._providers if p.name == name), None)

    def candidates_for(
        self,
        symbol: Symbol,
        timeframe: Timeframe,
        start_s: int | None = None,
        end_s: int | None = None,
    ) -> list[DataProvider]:
        """Enabled providers that support the symbol/timeframe, best first."""
        scored: list[tuple[int, str, DataProvider]] = []
        for provider in self._providers:
            if not provider.enabled:
                continue
            if not provider.supports_symbol(symbol):
                continue
            if not provider.supports_timeframe(timeframe):
                continue
            score = provider.priority
            available = provider.available_range(symbol, timeframe)
            if available and start_s is not None and end_s is not None:
                covers = available[0] <= start_s and available[1] >= end_s
                score += 20 if covers else 0
            scored.append((score, provider.name, provider))
        scored.sort(key=lambda item: (-item[0], item[1]))
        return [item[2] for item in scored]

    def resolve(
        self,
        symbol: Symbol,
        timeframe: Timeframe,
        start_s: int | None = None,
        end_s: int | None = None,
    ) -> DataProvider | None:
        """Best provider for the request, or ``None`` when none qualify."""
        candidates = self.candidates_for(symbol, timeframe, start_s, end_s)
        return candidates[0] if candidates else None