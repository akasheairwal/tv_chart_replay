"""Base indicator interface and registry (architecture ``#40``/``#41``)."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import polars as pl


class Indicator(ABC):
    """Abstract base class for technical indicators."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Machine identifier (e.g. 'sma', 'rsi')."""

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human readable title (e.g. 'Simple Moving Average')."""

    @property
    @abstractmethod
    def category(self) -> str:
        """Category: 'trend', 'momentum', 'volatility', 'volume'."""

    @property
    @abstractmethod
    def overlay(self) -> bool:
        """True if rendered on main chart price scale, False if rendered in separate sub-pane."""

    @property
    @abstractmethod
    def default_params(self) -> dict[str, Any]:
        """Default calculation parameter dictionary."""

    @property
    @abstractmethod
    def param_schema(self) -> dict[str, Any]:
        """Schema describing parameter types, labels, mins/maxs."""

    @abstractmethod
    def calculate(
        self,
        frame: pl.DataFrame,
        params: dict[str, Any] | None = None,
    ) -> dict[str, list[float | None]]:
        """Calculate indicator lines from OHLCV frame.
        
        Returns a dict mapping line names (e.g. 'value', 'upper', 'lower')
        to lists of float values (or None for warmup periods).
        """

    def metadata(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "display_name": self.display_name,
            "category": self.category,
            "overlay": self.overlay,
            "default_params": self.default_params,
            "param_schema": self.param_schema,
        }


class IndicatorRegistry:
    """Registry of available indicator definitions."""

    def __init__(self) -> None:
        self._indicators: dict[str, Indicator] = {}

    def register(self, indicator: Indicator) -> None:
        self._indicators[indicator.name.lower()] = indicator

    def get(self, name: str) -> Indicator | None:
        return self._indicators.get(name.lower())

    def list_catalog(self) -> list[dict[str, Any]]:
        return [ind.metadata() for ind in self._indicators.values()]
