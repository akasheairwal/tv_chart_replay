"""Provider catalog mapping, registry ranking/fallback, rate limiter."""

from __future__ import annotations

import time

from fakes import BrokenProvider, FakeProvider

from app.data.downloader.rate_limiter import RateLimiter
from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import H1, M1, M5, Timeframe
from app.data.providers.binance import BinanceProvider
from app.data.providers.catalog import (
    binance_pair,
    curated_catalog,
    dukascopy_name,
    yahoo_ticker,
)
from app.data.providers.registry import ProviderRegistry


def _symbol(
    symbol: str = "AAPL",
    asset_class: AssetClass = AssetClass.STOCK,
    providers: list[str] | None = None,
) -> Symbol:
    return Symbol(
        symbol=symbol,
        display_name=symbol,
        asset_class=asset_class,
        provider_candidates=providers or [],
    )


class CoveredProvider(FakeProvider):
    """Fake whose ``available_range`` is a known window."""

    def available_range(self, symbol: Symbol, timeframe: Timeframe) -> tuple[int, int]:
        return (1_000_000, 9_000_000)


def test_yahoo_ticker_mapping() -> None:
    assert yahoo_ticker(_symbol("EURUSD", AssetClass.FOREX)) == "EURUSD=X"
    assert yahoo_ticker(_symbol("BTCUSDT", AssetClass.CRYPTO)) == "BTC-USD"
    assert yahoo_ticker(_symbol("^GSPC", AssetClass.INDEX)) == "^GSPC"
    assert yahoo_ticker(_symbol("AAPL")) == "AAPL"
    assert yahoo_ticker(_symbol("CL=F", AssetClass.FUTURES)) == "CL=F"


def test_binance_pair_mapping() -> None:
    assert binance_pair(_symbol("BTCUSDT", AssetClass.CRYPTO)) == "BTCUSDT"
    assert binance_pair(_symbol("EURUSD", AssetClass.FOREX)) is None


def test_dukascopy_name_mapping() -> None:
    assert dukascopy_name(_symbol("EURUSD", AssetClass.FOREX)) == "EURUSD"
    assert dukascopy_name(_symbol("XAUUSD", AssetClass.METAL)) == "XAUUSD"
    assert dukascopy_name(_symbol("AAPL")) is None


def test_curated_catalog_covers_asset_classes() -> None:
    classes = {s.asset_class for s in curated_catalog()}
    assert classes == set(AssetClass)
    assert any(s.symbol == "EURUSD" for s in curated_catalog())


def test_binance_interval_mapping() -> None:
    provider = BinanceProvider()
    assert provider.interval_for(M1) == "1m"
    assert provider.interval_for(M5) == "5m"
    assert provider.interval_for(H1) == "1h"
    assert provider.interval_for(Timeframe("4H")) == "4h"
    assert provider.interval_for(Timeframe("1M")) == "1M"


def test_registry_ranks_by_priority() -> None:
    primary = FakeProvider(name="primary", priority=100)
    secondary = FakeProvider(name="secondary", priority=10)
    registry = ProviderRegistry([secondary, primary])
    best = registry.resolve(_symbol(), H1)
    assert best is primary
    assert registry.candidates_for(_symbol(), H1)[0] is primary


def test_registry_falls_back_on_symbol_support() -> None:
    class NarrowOnly(FakeProvider):
        name = "narrow"

        def supports_symbol(self, symbol: Symbol) -> bool:
            return symbol.asset_class == AssetClass.CRYPTO

    crypto_only = NarrowOnly()
    registry = ProviderRegistry([crypto_only])
    assert registry.resolve(_symbol("AAPL"), H1) is None
    assert registry.resolve(_symbol("BTCUSDT", AssetClass.CRYPTO), H1) is crypto_only


def test_registry_skips_disabled() -> None:
    disabled = FakeProvider(name="off", enabled=False, priority=1000)
    enabled = FakeProvider(name="on", priority=1)
    registry = ProviderRegistry([disabled, enabled])
    assert registry.resolve(_symbol(), H1) is enabled


def test_rank_prefers_known_range_coverage() -> None:
    broad = FakeProvider(name="broad", priority=10)
    precise = CoveredProvider(name="precise", priority=10)
    registry = ProviderRegistry([broad, precise])
    scored = registry.candidates_for(_symbol(), H1, start_s=2_000_000, end_s=5_000_000)
    assert scored[0] is precise


def test_rate_limiter_enforces_interval() -> None:
    limiter = RateLimiter(min_interval_ms=50, max_concurrency=1)
    start = time.monotonic()
    with limiter.acquire():
        pass
    with limiter.acquire():
        elapsed = time.monotonic() - start
        assert elapsed >= 0.04


def test_broken_provider_still_resolves() -> None:
    broken = BrokenProvider(priority=1000)
    registry = ProviderRegistry([broken])
    assert registry.resolve(_symbol(), H1) is broken
