"""Binance public klines provider (free, no key).

Full crypto history at any accepted interval via the public REST API.
Pages of 1000 candles; applies its own interval mapping.
"""
from __future__ import annotations

from typing import Any

import polars as pl
import requests

from app.data.errors import ProviderRateLimitError, ProviderUnavailableError
from app.data.models.candle import CANONICAL_COLUMNS
from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import Timeframe

#: Binance spot kline intervals that actually exist.  Advertising intervals
#: the API doesn't support (2m/10m/45m) made every request 400 before the
#: provider chain fell back to the next source.
BINANCE_INTERVALS = frozenset(
    {"1m", "3m", "5m", "15m", "30m", "1H", "2H", "4H", "6H", "8H", "12H", "1D", "3D", "1W", "1M"}
)
from app.data.providers.base import DataProvider, ProgressCallback, ProviderHealth
from app.data.providers.catalog import binance_pair

BINANCE_BASE_URL = "https://api.binance.com"
PAGE_LIMIT = 1000

_INTERVAL_MAP = {
    "m": "m",
    "H": "h",
    "D": "d",
    "W": "w",
    "M": "M",
}


class BinanceProvider(DataProvider):
    name = "binance"
    priority = 90
    supported_asset_classes = frozenset({AssetClass.CRYPTO})

    def __init__(self, *, enabled: bool | None = None, base_url: str = BINANCE_BASE_URL) -> None:
        super().__init__(enabled=enabled)
        self.base_url = base_url
        self._session = requests.Session()

    def supports_symbol(self, symbol: Symbol) -> bool:
        return symbol.asset_class == AssetClass.CRYPTO and binance_pair(symbol) is not None

    def supports_timeframe(self, timeframe: Timeframe) -> bool:
        return timeframe.freq in BINANCE_INTERVALS

    def interval_for(self, timeframe: Timeframe) -> str:
        unit = _INTERVAL_MAP[timeframe.unit]
        return f"{timeframe.number}{unit}"

    def download(
        self,
        symbol: Symbol,
        timeframe: Timeframe,
        start_s: int,
        end_s: int,
        progress: ProgressCallback,
    ) -> pl.DataFrame:
        pair = binance_pair(symbol)
        if pair is None:
            raise ProviderUnavailableError(f"{symbol.symbol} is not a Binance pair")
        interval = self.interval_for(timeframe)

        progress(0.05, f"downloading {pair} {interval}")
        rows: list[list[Any]] = []
        start_ms = start_s * 1000
        end_ms = end_s * 1000
        cursor = start_ms
        total_span = max(end_ms - start_ms, 1)

        step_ms = max(60_000, timeframe.seconds * 1000 * (PAGE_LIMIT - 1))
        while cursor <= end_ms:
            klines = self._get_klines(pair, interval, cursor, min(cursor + step_ms, end_ms))
            if not klines:
                break
            for k in klines:
                rows.append(
                    [
                        int(k[0]) // 1000,
                        float(k[1]),
                        float(k[2]),
                        float(k[3]),
                        float(k[4]),
                        float(k[5]),
                    ]
                )
            last_open_ms = int(klines[-1][0])
            if last_open_ms <= cursor:
                break  # no forward progress guard
            cursor = last_open_ms + 1
            fraction = min(0.95, 0.05 + (cursor - start_ms) / total_span * 0.9)
            progress(fraction, f"{len(rows)} candles")

        progress(1.0, f"{len(rows)} candles downloaded")
        if not rows:
            return pl.DataFrame({c: [] for c in CANONICAL_COLUMNS})
        return pl.DataFrame(
            rows,
            schema=[(c, pl.Int64 if c == "timestamp" else pl.Float64) for c in CANONICAL_COLUMNS],
            orient="row",
        )

    def health_check(self) -> ProviderHealth:
        import time

        start = time.monotonic()
        try:
            resp = self._session.get(f"{self.base_url}/api/v3/ping", timeout=5)
            return ProviderHealth(
                healthy=resp.status_code == 200,
                latency_ms=(time.monotonic() - start) * 1000,
                detail=f"http {resp.status_code}",
            )
        except requests.RequestException as exc:
            return ProviderHealth(healthy=False, latency_ms=(time.monotonic() - start) * 1000, detail=str(exc))

    def _get_klines(
        self, pair: str, interval: str, start_ms: int, end_ms: int
    ) -> list[list[Any]]:
        try:
            resp = self._session.get(
                f"{self.base_url}/api/v3/klines",
                params={
                    "symbol": pair,
                    "interval": interval,
                    "startTime": start_ms,
                    "endTime": end_ms,
                    "limit": PAGE_LIMIT,
                },
                headers={"Accept": "application/json"},
                timeout=15,
            )
        except requests.RequestException as exc:
            raise ProviderUnavailableError(f"Binance request failed: {exc}") from exc

        if resp.status_code in (418, 429):
            raise ProviderRateLimitError(f"Binance rate limited (http {resp.status_code})")
        if resp.status_code in (403, 451):
            raise ProviderUnavailableError(
                f"Binance geo-restricted or forbidden (http {resp.status_code})"
            )
        resp.raise_for_status()
        return resp.json()