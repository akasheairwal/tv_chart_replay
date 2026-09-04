"""Dukascopy provider (Architecture §10).

Serves high-precision Forex (EURUSD, GBPUSD, etc.) and Metals (XAUUSD, XAGUSD).
Derived timeframes resample from a supported base interval via `resample()`.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

import polars as pl
import requests

from app.data.errors import ProviderUnavailableError
from app.data.models.candle import empty_frame
from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import Timeframe
from app.data.normalization.resampler import resample
from app.data.providers.base import DataProvider, ProgressCallback, ProviderHealth
from app.data.providers.catalog import dukascopy_name

logger = logging.getLogger(__name__)

_SOURCE_INTERVALS: dict[str, tuple[str, str]] = {
    "1m": ("1m", "1MIN"),
    "5m": ("5m", "5MIN"),
    "10m": ("10m", "10MIN"),
    "15m": ("15m", "15MIN"),
    "30m": ("30m", "30MIN"),
    "1H": ("1H", "1HOUR"),
    "4H": ("4H", "4HOUR"),
    "1D": ("1D", "1DAY"),
    "1W": ("1W", "1WEEK"),
    "1M": ("1M", "1MONTH"),
}

DERIVED_INTERVALS: dict[str, tuple[str, str]] = {
    "2m": ("1m", "1MIN"),
    "3m": ("1m", "1MIN"),
    "45m": ("15m", "15MIN"),
    "2H": ("1H", "1HOUR"),
    "6H": ("1H", "1HOUR"),
    "12H": ("1H", "1HOUR"),
}

ALL_SUPPORTED = frozenset(_SOURCE_INTERVALS) | frozenset(DERIVED_INTERVALS)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.dukascopy.com/",
}


def _format_dukascopy_instrument(symbol: Symbol) -> str | None:
    raw = dukascopy_name(symbol)
    if not raw:
        return None
    raw = raw.upper()
    if len(raw) == 6:
        return f"{raw[:3]}/{raw[3:]}"
    return raw


class DukascopyProvider(DataProvider):
    name = "dukascopy"
    priority = 90
    supported_asset_classes = frozenset({AssetClass.FOREX, AssetClass.METAL})

    def __init__(self, *, enabled: bool | None = None) -> None:
        super().__init__(enabled=enabled)
        self._session = requests.Session()

    def supports_symbol(self, symbol: Symbol) -> bool:
        if symbol.asset_class not in self.supported_asset_classes:
            return False
        return _format_dukascopy_instrument(symbol) is not None

    def supports_timeframe(self, timeframe: Timeframe) -> bool:
        return timeframe.freq in ALL_SUPPORTED

    def download(
        self,
        symbol: Symbol,
        timeframe: Timeframe,
        start_s: int,
        end_s: int,
        progress: ProgressCallback,
    ) -> pl.DataFrame:
        instrument = _format_dukascopy_instrument(symbol)
        if not instrument:
            raise ProviderUnavailableError(f"Unsupported Dukascopy symbol: {symbol.symbol}")

        source_freq, dukas_interval = self._resolve_interval(timeframe)
        progress(0.1, f"downloading {instrument} {dukas_interval}")

        cursor_ms = start_s * 1000
        end_ms = end_s * 1000
        all_rows: list[list[Any]] = []

        batch_limit = 3000
        max_batches = 50
        batch_count = 0

        while cursor_ms <= end_ms and batch_count < max_batches:
            batch_count += 1
            params = {
                "path": "chart/json3",
                "instrument": instrument,
                "offer_side": "B",
                "interval": dukas_interval,
                "last_update": str(cursor_ms),
                "time_direction": "N",
                "limit": str(batch_limit),
                "jsonp": "cb",
            }

            try:
                resp = self._session.get(
                    "https://freeserv.dukascopy.com/2.0/index.php",
                    params=params,
                    headers=_HEADERS,
                    timeout=10,
                )
                if resp.status_code != 200:
                    raise ProviderUnavailableError(
                        f"Dukascopy HTTP {resp.status_code} for {instrument}"
                    )

                text = resp.text.strip()
                if not text.startswith("cb(") or not text.endswith(");"):
                    break

                raw_json = text[3:-2]
                rows = json.loads(raw_json)
                if not rows or not isinstance(rows, list):
                    break

                batch_added = 0
                for row in rows:
                    if len(row) >= 6:
                        ts_ms = int(row[0])
                        if ts_ms > end_ms:
                            break
                        if ts_ms >= cursor_ms:
                            all_rows.append(row)
                            batch_added += 1

                last_ts = int(rows[-1][0])
                if last_ts <= cursor_ms or batch_added == 0:
                    break

                cursor_ms = last_ts + 1
                progress(
                    min(0.8, 0.1 + (batch_count / max_batches) * 0.7),
                    f"{len(all_rows)} candles fetched",
                )

            except (ProviderUnavailableError, requests.RequestException):
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning("Dukascopy batch fetch error for %s: %s", instrument, exc)
                break

        if batch_count >= max_batches and cursor_ms <= end_ms:
            # Hit the batch ceiling before covering the requested window:
            # the returned frame is a truncation, not full coverage.
            logger.warning(
                "Dukascopy fetch for %s truncated at batch limit (%d batches); "
                "coverage ends at %s",
                instrument,
                max_batches,
                all_rows[-1][0] if all_rows else "start",
            )

        if not all_rows:
            progress(1.0, "no data returned")
            return empty_frame()

        # Deduplicate by timestamp_ms
        seen_ts = set()
        dedup_rows = []
        for r in all_rows:
            ts_sec = int(r[0]) // 1000
            if ts_sec not in seen_ts:
                seen_ts.add(ts_sec)
                dedup_rows.append(
                    {
                        "timestamp": ts_sec,
                        "open": float(r[1]),
                        "high": float(r[2]),
                        "low": float(r[3]),
                        "close": float(r[4]),
                        "volume": float(r[5]),
                    }
                )

        frame = pl.DataFrame(dedup_rows)
        progress(0.85, f"{frame.height} source candles")

        if source_freq != timeframe.freq:
            frame = resample(frame, Timeframe(source_freq), timeframe)
            progress(0.95, f"resampled to {timeframe.freq}")

        progress(1.0, f"{frame.height} candles")
        return frame

    def health_check(self) -> ProviderHealth:
        start_t = time.monotonic()
        try:
            resp = requests.get(
                "https://freeserv.dukascopy.com/2.0/index.php",
                params={
                    "path": "chart/json3",
                    "instrument": "EUR/USD",
                    "offer_side": "B",
                    "interval": "1DAY",
                    "last_update": str(int(time.time() - 86400 * 3) * 1000),
                    "time_direction": "N",
                    "limit": "5",
                    "jsonp": "cb",
                },
                headers=_HEADERS,
                timeout=5,
            )
            return ProviderHealth(
                healthy=resp.status_code == 200,
                latency_ms=(time.monotonic() - start_t) * 1000,
                detail=f"http {resp.status_code}",
            )
        except requests.RequestException as exc:
            return ProviderHealth(
                healthy=False, latency_ms=(time.monotonic() - start_t) * 1000, detail=str(exc)
            )

    def _resolve_interval(self, timeframe: Timeframe) -> tuple[str, str]:
        if timeframe.freq in _SOURCE_INTERVALS:
            return _SOURCE_INTERVALS[timeframe.freq]
        if timeframe.freq in DERIVED_INTERVALS:
            return DERIVED_INTERVALS[timeframe.freq]
        raise ValueError(f"Unsupported Dukascopy timeframe: {timeframe.freq}")
