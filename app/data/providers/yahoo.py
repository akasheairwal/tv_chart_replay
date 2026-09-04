"""Yahoo Finance provider (via the free ``yfinance`` library).

Broadest coverage (stocks, indices, forex, metals, futures, crypto).
Derived timeframes resample from a supported base interval (#25/#26).
"""
from __future__ import annotations

import logging
import time
from datetime import UTC, datetime, timedelta

import polars as pl

from app.data.errors import ProviderUnavailableError
from app.data.models.candle import empty_frame
from app.data.models.symbol import AssetClass, Symbol, SymbolSearchResult
from app.data.models.timeframe import Timeframe
from app.data.normalization.resampler import resample
from app.data.providers.base import DataProvider, ProgressCallback, ProviderHealth
from app.data.providers.catalog import yahoo_ticker

logger = logging.getLogger(__name__)

#: target freq -> (source freq, yfinance interval code).  Derived timeframes
#: (3m, 10m, 45m, 2H/4H/6H/12H) resample from a supported base interval.
_SOURCE_INTERVALS: dict[str, tuple[str, str]] = {
    "1m": ("1m", "1m"),
    "2m": ("2m", "2m"),
    "5m": ("5m", "5m"),
    "15m": ("15m", "15m"),
    "30m": ("30m", "30m"),
    "1H": ("1H", "1h"),
    "1D": ("1D", "1d"),
    "1W": ("1W", "1wk"),
    "1M": ("1M", "1mo"),
}

DERIVED_INTERVALS: dict[str, tuple[str, str]] = {
    "3m": ("1m", "1m"),
    "10m": ("5m", "5m"),
    "45m": ("15m", "15m"),
    "2H": ("1H", "1h"),
    "4H": ("1H", "1h"),
    "6H": ("1H", "1h"),
    "12H": ("1H", "1h"),
}

ALL_SUPPORTED = frozenset(_SOURCE_INTERVALS) | frozenset(DERIVED_INTERVALS)
_YF_COLUMNS = ("Open", "High", "Low", "Close", "Volume")


# -- worldwide symbol search (Yahoo public search endpoint) -----------------

_YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
_SEARCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

_QUOTE_TYPE_TO_ASSET_CLASS: dict[str, AssetClass] = {
    "EQUITY": AssetClass.STOCK,
    "ETF": AssetClass.STOCK,
    "MUTUALFUND": AssetClass.STOCK,
    "INDEX": AssetClass.INDEX,
    "CURRENCY": AssetClass.FOREX,
    "CRYPTOCURRENCY": AssetClass.CRYPTO,
    "FUTURE": AssetClass.FUTURES,
}


def quote_type_to_asset_class(quote_type: str) -> AssetClass:
    """Map a Yahoo ``quoteType`` to the canonical asset class."""
    return _QUOTE_TYPE_TO_ASSET_CLASS.get(str(quote_type).upper(), AssetClass.STOCK)


#: Simple TTL cache so typing in the search box does not hammer Yahoo.
_SEARCH_CACHE_TTL_S = 600.0
_SEARCH_CACHE_MAX = 256
_search_cache: dict[str, tuple[float, list[SymbolSearchResult]]] = {}


_http_session = None


def _get_http_session():
    global _http_session
    if _http_session is None:
        import requests

        _http_session = requests.Session()
    return _http_session


def search_yahoo(query: str, limit: int = 10) -> list[SymbolSearchResult]:
    """Full-text symbol search against Yahoo Finance.

    Accepts company names ("Samsung", "Reliance", "apple"), tickers
    ("7203.T"), indices ("^N225"), etc. - anything Yahoo's own search box
    understands. Raises :class:`ProviderUnavailableError` on network/API
    failure so callers can degrade to local-only results.
    """
    import requests

    cleaned = (query or "").strip()
    if not cleaned:
        return []

    cache_key = f"{cleaned.lower()}:{limit}"
    now = time.monotonic()
    cached = _search_cache.get(cache_key)
    if cached is not None and now - cached[0] < _SEARCH_CACHE_TTL_S:
        return list(cached[1])

    session = _get_http_session()
    try:
        resp = session.get(
            _YAHOO_SEARCH_URL,
            params={
                "q": cleaned,
                "quotesCount": str(max(1, min(int(limit), 20))),
                "newsCount": "0",
                "listsCount": "0",
            },
            headers=_SEARCH_HEADERS,
            timeout=5,
        )
    except requests.RequestException as exc:
        raise ProviderUnavailableError(f"Yahoo symbol search failed: {exc}") from exc

    if resp.status_code != 200:
        raise ProviderUnavailableError(f"Yahoo symbol search HTTP {resp.status_code}")

    try:
        payload = resp.json()
    except ValueError as exc:
        raise ProviderUnavailableError("Yahoo symbol search returned invalid JSON") from exc

    results: list[SymbolSearchResult] = []
    for quote in payload.get("quotes") or []:
        raw_symbol = str(quote.get("symbol") or "").strip()
        if not raw_symbol:
            continue
        if quote.get("isYahooFinance") is False:
            continue
        display = (
            quote.get("shortname")
            or quote.get("longname")
            or quote.get("shortName")
            or quote.get("longName")
            or raw_symbol
        )
        exchange = str(quote.get("exchDisp") or quote.get("exch") or "").strip()
        asset_class = quote_type_to_asset_class(str(quote.get("quoteType") or ""))
        results.append(
            SymbolSearchResult(
                symbol=raw_symbol.upper(),
                display_name=str(display),
                asset_class=asset_class.value,
                exchange=exchange,
                provider_candidates=["yahoo"],
            )
        )

    if len(_search_cache) >= _SEARCH_CACHE_MAX:
        # Drop the oldest half instead of growing without bound.
        for key in sorted(_search_cache, key=lambda k: _search_cache[k][0])[
            : _SEARCH_CACHE_MAX // 2
        ]:
            _search_cache.pop(key, None)
    _search_cache[cache_key] = (now, results)
    return list(results)


def lookup_symbol(symbol_text: str) -> Symbol | None:
    """Resolve an exact ticker (e.g. ``SAP.DE``, ``^N225``) via Yahoo.

    Returns ``None`` when the network is unavailable or no exact match is
    found - callers fall back to their existing behavior.
    """
    try:
        candidates = search_yahoo(symbol_text, limit=6)
    except Exception:  # noqa: BLE001 - lookup must never break resolution
        logger.debug("yahoo lookup unavailable for %r", symbol_text)
        return None

    want = symbol_text.strip().upper()
    for row in candidates:
        if row.symbol == want:
            return Symbol(
                symbol=row.symbol,
                display_name=row.display_name,
                asset_class=AssetClass(row.asset_class),
                exchange=row.exchange,
                provider_candidates=["yahoo"],
            )
    return None


class YahooProvider(DataProvider):
    name = "yahoo"
    priority = 80
    supported_asset_classes = frozenset(AssetClass)

    def supports_symbol(self, symbol: Symbol) -> bool:
        return yahoo_ticker(symbol) is not None

    def supports_timeframe(self, timeframe: Timeframe) -> bool:
        return timeframe.freq in ALL_SUPPORTED

    def available_range(self, symbol: Symbol, timeframe: Timeframe) -> tuple[int, int] | None:
        return None  # provider-internal limits are dynamic; unknown up front

    def download(
        self,
        symbol: Symbol,
        timeframe: Timeframe,
        start_s: int,
        end_s: int,
        progress: ProgressCallback,
    ) -> pl.DataFrame:
        import yfinance as yf

        ticker = yahoo_ticker(symbol)
        source_freq, yf_interval = self._resolve_interval(timeframe)
        progress(0.1, f"downloading {ticker} {yf_interval}")

        start_dt = datetime.fromtimestamp(start_s, UTC)
        end_dt = datetime.fromtimestamp(end_s, UTC)

        # yfinance end date is exclusive; add 1 day to ensure full end date inclusion
        start = start_dt.strftime("%Y-%m-%d")
        end = (end_dt + timedelta(days=1)).strftime("%Y-%m-%d")

        try:
            ys = yf.download(
                ticker,
                start=start,
                end=end,
                interval=yf_interval,
                auto_adjust=False,
                actions=False,
                progress=False,
                threads=False,
                group_by="column",
            )
        except Exception as exc:  # yfinance raises broadly
            raise ProviderUnavailableError(f"Yahoo download failed for {ticker}: {exc}") from exc

        if ys is None or ys.empty:
            # Fallback to period-based download if narrow/weekend range returned 0 candles
            try:
                period_fallback = "7d" if yf_interval in ("1m", "2m", "5m", "15m", "30m", "1h") else "1mo"
                ys = yf.download(
                    ticker,
                    period=period_fallback,
                    interval=yf_interval,
                    auto_adjust=False,
                    actions=False,
                    progress=False,
                    threads=False,
                    group_by="column",
                )
            except Exception as exc:  # noqa: BLE001
                logger.debug("period fallback failed for %s: %s", ticker, exc)

        if ys is None or ys.empty:
            progress(1.0, "no data returned")
            return empty_frame()

        frame = self._to_canonical(ys)

        # Always filter to the requested [start_s, end_s] range so padding
        # or fallback data never records out-of-range timestamps.
        frame = frame.filter(
            (pl.col("timestamp") >= int(start_s)) & (pl.col("timestamp") <= int(end_s))
        )
        if frame.height == 0:
            progress(1.0, "no data returned within requested range")
            return empty_frame()
        progress(0.85, f"{frame.height} source candles")

        if source_freq != timeframe.freq:
            frame = resample(frame, Timeframe(source_freq), timeframe)
            progress(0.95, f"resampled to {timeframe.freq}")
        progress(1.0, f"{frame.height} candles")
        return frame

    def health_check(self) -> ProviderHealth:
        import time

        import requests

        start = time.monotonic()
        try:
            resp = requests.get(
                "https://query1.finance.yahoo.com/v8/finance/chart/AAPL",
                params={"range": "1d", "interval": "1d"},
                timeout=5,
            )
            return ProviderHealth(
                healthy=resp.status_code == 200,
                latency_ms=(time.monotonic() - start) * 1000,
                detail=f"http {resp.status_code}",
            )
        except requests.RequestException as exc:
            return ProviderHealth(
                healthy=False, latency_ms=(time.monotonic() - start) * 1000, detail=str(exc)
            )

    def _resolve_interval(self, timeframe: Timeframe) -> tuple[str, str]:
        """Return ``(source_freq, yfinance_interval)`` for the request."""
        if timeframe.freq in _SOURCE_INTERVALS:
            return _SOURCE_INTERVALS[timeframe.freq]
        if timeframe.freq in DERIVED_INTERVALS:
            return DERIVED_INTERVALS[timeframe.freq]
        raise ValueError(f"Unsupported Yahoo timeframe: {timeframe.freq}")

    @staticmethod
    def _to_canonical(ys: object) -> pl.DataFrame:
        """Convert a yfinance pandas frame into the canonical OHLCV frame."""
        import pandas as pd

        pdf: pd.DataFrame = ys
        if isinstance(pdf.columns, pd.MultiIndex):
            if "Open" in pdf.columns.get_level_values(0):
                pdf.columns = pdf.columns.get_level_values(0)
            elif pdf.columns.nlevels > 1 and "Open" in pdf.columns.get_level_values(1):
                pdf.columns = pdf.columns.get_level_values(1)

        cols = [c for c in _YF_COLUMNS if c in pdf.columns]
        pdf = pdf[cols].copy()

        pdf = pdf.dropna(how="all")
        index_name = pdf.index.name or "Date"
        pdf[index_name] = pd.to_datetime(pdf.index)
        if getattr(pdf[index_name].dtype, "tz", None) is None:
            pdf[index_name] = pdf[index_name].dt.tz_localize("UTC")

        frame = pl.from_pandas(
            pdf[[index_name, *_YF_COLUMNS]].rename(
                columns={
                    index_name: "timestamp",
                    "Open": "open",
                    "High": "high",
                    "Low": "low",
                    "Close": "close",
                    "Volume": "volume",
                }
            )
        )
        return frame.select(
            pl.col("timestamp").cast(pl.Datetime, strict=False).dt.epoch("s").cast(pl.Int64),
            pl.col("open").cast(pl.Float64, strict=False),
            pl.col("high").cast(pl.Float64, strict=False),
            pl.col("low").cast(pl.Float64, strict=False),
            pl.col("close").cast(pl.Float64, strict=False),
            pl.col("volume").cast(pl.Float64, strict=False),
        )