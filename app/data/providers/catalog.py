"""Curated symbol catalog + provider ticker mappings.

The catalog is the offline seed for ``SymbolRegistry`` and a fallback for
``searchSymbols`` when provider catalogs are unreachable.
"""
from __future__ import annotations

from app.data.models.symbol import AssetClass, Symbol


def _sym(
    symbol: str,
    display: str,
    asset_class: AssetClass,
    exchange: str,
    providers: list[str],
    timezone: str = "UTC",
) -> Symbol:
    return Symbol(
        symbol=symbol,
        display_name=display,
        asset_class=asset_class,
        exchange=exchange,
        timezone=timezone,
        provider_candidates=list(providers),
    )


CATALOG: list[Symbol] = [
    # Forex (Dukascopy deep history; Yahoo fallback).
    _sym("EURUSD", "EUR/USD", AssetClass.FOREX, "FX", ["dukascopy", "yahoo"]),
    _sym("GBPUSD", "GBP/USD", AssetClass.FOREX, "FX", ["dukascopy", "yahoo"]),
    _sym("USDJPY", "USD/JPY", AssetClass.FOREX, "FX", ["dukascopy", "yahoo"]),
    _sym("USDCHF", "USD/CHF", AssetClass.FOREX, "FX", ["dukascopy", "yahoo"]),
    _sym("AUDUSD", "AUD/USD", AssetClass.FOREX, "FX", ["dukascopy", "yahoo"]),
    _sym("USDCAD", "USD/CAD", AssetClass.FOREX, "FX", ["dukascopy", "yahoo"]),
    _sym("NZDUSD", "NZD/USD", AssetClass.FOREX, "FX", ["dukascopy", "yahoo"]),
    # Metals.
    _sym("XAUUSD", "Gold / USD", AssetClass.METAL, "FX", ["dukascopy", "yahoo"]),
    _sym("XAGUSD", "Silver / USD", AssetClass.METAL, "FX", ["dukascopy", "yahoo"]),
    # Crypto (Binance full history; Yahoo fallback).
    _sym("BTCUSDT", "Bitcoin / Tether", AssetClass.CRYPTO, "BINANCE", ["binance", "yahoo"]),
    _sym("ETHUSDT", "Ethereum / Tether", AssetClass.CRYPTO, "BINANCE", ["binance", "yahoo"]),
    _sym("SOLUSDT", "Solana / Tether", AssetClass.CRYPTO, "BINANCE", ["binance", "yahoo"]),
    _sym("BNBUSDT", "BNB / Tether", AssetClass.CRYPTO, "BINANCE", ["binance", "yahoo"]),
    _sym("XRPUSDT", "XRP / Tether", AssetClass.CRYPTO, "BINANCE", ["binance", "yahoo"]),
    _sym("DOGEUSDT", "Dogecoin / Tether", AssetClass.CRYPTO, "BINANCE", ["binance", "yahoo"]),
    # US equities.
    _sym("AAPL", "Apple Inc.", AssetClass.STOCK, "NASDAQ", ["yahoo"]),
    _sym("MSFT", "Microsoft Corp.", AssetClass.STOCK, "NASDAQ", ["yahoo"]),
    _sym("GOOGL", "Alphabet Inc.", AssetClass.STOCK, "NASDAQ", ["yahoo"]),
    _sym("AMZN", "Amazon.com Inc.", AssetClass.STOCK, "NASDAQ", ["yahoo"]),
    _sym("TSLA", "Tesla Inc.", AssetClass.STOCK, "NASDAQ", ["yahoo"]),
    _sym("META", "Meta Platforms Inc.", AssetClass.STOCK, "NASDAQ", ["yahoo"]),
    _sym("NVDA", "NVIDIA Corp.", AssetClass.STOCK, "NASDAQ", ["yahoo"]),
    _sym("NFLX", "Netflix Inc.", AssetClass.STOCK, "NASDAQ", ["yahoo"]),
    # Indices (Yahoo).
    _sym("^GSPC", "S&P 500", AssetClass.INDEX, "NYSE", ["yahoo"]),
    _sym("^IXIC", "NASDAQ Composite", AssetClass.INDEX, "NASDAQ", ["yahoo"]),
    _sym("^DJI", "Dow Jones Industrial", AssetClass.INDEX, "NYSE", ["yahoo"]),
    _sym("^NSEI", "NIFTY 50", AssetClass.INDEX, "NSE", ["yahoo"]),
    _sym("^VIX", "CBOE Volatility Index", AssetClass.INDEX, "CBOE", ["yahoo"]),
    # Futures (Yahoo continuous contracts).
    _sym("CL=F", "Crude Oil WTI", AssetClass.FUTURES, "NYMEX", ["yahoo"]),
    _sym("GC=F", "Gold Futures", AssetClass.FUTURES, "COMEX", ["yahoo"]),
    _sym("ES=F", "S&P 500 E-mini", AssetClass.FUTURES, "CME", ["yahoo"]),
    _sym("NQ=F", "NASDAQ 100 E-mini", AssetClass.FUTURES, "CME", ["yahoo"]),
]


def curated_catalog() -> list[Symbol]:
    return list(CATALOG)


def provider_candidates_for(symbol: str) -> list[str]:
    for entry in CATALOG:
        if entry.symbol.upper() == symbol.upper():
            return list(entry.provider_candidates)
    return []


# -- provider ticker mappings ----------------------------------------------


def yahoo_ticker(symbol: Symbol) -> str:
    """Canonical symbol -> Yahoo Finance ticker."""
    cleaned = symbol.symbol.replace("/", "").replace("-", "")
    if symbol.asset_class == AssetClass.CRYPTO:
        if cleaned.upper().endswith("USDT"):
            base = cleaned[:-4]
        elif cleaned.upper().endswith("USD"):
            base = cleaned[:-3]
        else:
            base = cleaned
        return f"{base}-USD"
    if symbol.asset_class == AssetClass.FOREX:
        return f"{cleaned}=X"
    if symbol.asset_class == AssetClass.METAL:
        if cleaned.upper() in ("XAUUSD", "GOLD"):
            return "GC=F"
        if cleaned.upper() in ("XAGUSD", "SILVER"):
            return "SI=F"
        return f"{cleaned}=X"
    if symbol.asset_class == AssetClass.INDEX and not cleaned.startswith("^"):
        return f"^{cleaned}"
    return symbol.symbol.upper()


def binance_pair(symbol: Symbol) -> str | None:
    """Canonical symbol -> Binance pair, e.g. ``BTCUSDT``."""
    if symbol.asset_class != AssetClass.CRYPTO:
        return None
    return symbol.symbol.replace("-", "").replace("/", "").upper()


def dukascopy_name(symbol: Symbol) -> str | None:
    """Canonical symbol -> Dukascopy instrument, e.g. ``EURUSD``."""
    if symbol.asset_class in (AssetClass.FOREX, AssetClass.METAL):
        return symbol.symbol.replace("-", "").replace("/", "").upper()
    return None