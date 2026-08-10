"""Indicator Engine coordinating indicator calculations (architecture ``#40``–``#42``)."""
from __future__ import annotations

import logging
from typing import Any

import polars as pl

from app.indicators.base import IndicatorRegistry
from app.indicators.momentum import MACDIndicator, RSIIndicator, StochasticIndicator
from app.indicators.trend import (
    EMAIndicator,
    HMAIndicator,
    SMAIndicator,
    SupertrendIndicator,
    VWAPIndicator,
    WMAIndicator,
)
from app.indicators.volatility import (
    ATRIndicator,
    BollingerBandsIndicator,
    KeltnerChannelsIndicator,
)
from app.indicators.volume import MFIIndicator, OBVIndicator

logger = logging.getLogger(__name__)


def build_default_registry() -> IndicatorRegistry:
    registry = IndicatorRegistry()
    # Trend
    registry.register(SMAIndicator())
    registry.register(EMAIndicator())
    registry.register(WMAIndicator())
    registry.register(HMAIndicator())
    registry.register(VWAPIndicator())
    registry.register(SupertrendIndicator())
    # Momentum
    registry.register(RSIIndicator())
    registry.register(MACDIndicator())
    registry.register(StochasticIndicator())
    # Volatility
    registry.register(ATRIndicator())
    registry.register(BollingerBandsIndicator())
    registry.register(KeltnerChannelsIndicator())
    # Volume
    registry.register(OBVIndicator())
    registry.register(MFIIndicator())
    return registry


class IndicatorEngine:
    """Computes technical indicators across replay-visible data slices."""

    def __init__(self, registry: IndicatorRegistry | None = None) -> None:
        self.registry = registry or build_default_registry()

    def get_catalog(self) -> list[dict[str, Any]]:
        return self.registry.list_catalog()

    def calculate(
        self,
        indicator_name: str,
        frame: pl.DataFrame,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        indicator = self.registry.get(indicator_name)
        if indicator is None:
            raise ValueError(f"Unknown indicator '{indicator_name}'")

        if frame.height == 0:
            return {
                "name": indicator.name,
                "display_name": indicator.display_name,
                "overlay": indicator.overlay,
                "category": indicator.category,
                "timestamps": [],
                "lines": {},
            }

        lines = indicator.calculate(frame, params)
        timestamps = frame["timestamp"].to_list()

        return {
            "name": indicator.name,
            "display_name": indicator.display_name,
            "overlay": indicator.overlay,
            "category": indicator.category,
            "timestamps": timestamps,
            "lines": lines,
        }
