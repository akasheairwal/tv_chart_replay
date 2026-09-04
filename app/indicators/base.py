"""Base indicator interface and registry (architecture ``#40``/``#41``)."""
from __future__ import annotations

import math
from abc import ABC, abstractmethod
from typing import Any

import numpy as np
import polars as pl


def to_clean_list(arr: np.ndarray) -> list[float | None]:
    isnan = math.isnan
    round_ = round
    float_ = float
    return [None if isnan(v) else round_(float_(v), 6) for v in arr]


def calc_ema(data: np.ndarray, period: int) -> np.ndarray:
    n = len(data)
    out = np.full(n, np.nan, dtype=np.float64)
    if n >= period > 0:
        alpha = 2.0 / (period + 1.0)
        out[period - 1] = np.mean(data[:period])
        for i in range(period, n):
            out[i] = alpha * data[i] + (1.0 - alpha) * out[i - 1]
    return out


def calc_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int) -> np.ndarray:
    n = len(high)
    atr = np.full(n, np.nan, dtype=np.float64)
    if n < period or period <= 0:
        return atr

    tr = np.empty(n, dtype=np.float64)
    tr[0] = high[0] - low[0]
    if n > 1:
        hl = high[1:] - low[1:]
        hc = np.abs(high[1:] - close[:-1])
        lc = np.abs(low[1:] - close[:-1])
        tr[1:] = np.maximum(hl, np.maximum(hc, lc))

    atr[period - 1] = np.mean(tr[:period])
    for i in range(period, n):
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    return atr


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
