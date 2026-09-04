"""Canonical symbol model (architecture ``#9``)."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class AssetClass(str, Enum):
    FOREX = "forex"
    STOCK = "stock"
    INDEX = "index"
    FUTURES = "futures"
    METAL = "metal"
    CRYPTO = "crypto"


def normalize_symbol(value: str) -> str:
    """Normalize a user-supplied symbol to canonical form (keeps ``^``)."""
    return value.strip().upper()


@dataclass(frozen=True)
class Symbol:
    symbol: str
    display_name: str
    asset_class: AssetClass
    exchange: str = ""
    timezone: str = "UTC"
    provider_candidates: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        object.__setattr__(self, "symbol", normalize_symbol(self.symbol))

    def as_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "display_name": self.display_name,
            "asset_class": self.asset_class.value,
            "exchange": self.exchange,
            "timezone": self.timezone,
            "provider_candidates": list(self.provider_candidates),
        }


@dataclass(frozen=True)
class SymbolSearchResult:
    """One row returned by ``searchSymbols``."""

    symbol: str
    display_name: str
    asset_class: str
    exchange: str = ""
    provider_candidates: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "display_name": self.display_name,
            "asset_class": self.asset_class,
            "exchange": self.exchange,
            "provider_candidates": list(self.provider_candidates),
        }