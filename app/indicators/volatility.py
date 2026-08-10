"""Volatility indicators: ATR, Bollinger Bands, Keltner Channels (architecture ``#41``)."""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import polars as pl

from app.indicators.base import Indicator


def _to_clean_list(arr: np.ndarray) -> list[float | None]:
    return [None if np.isnan(v) or math.isnan(v) else round(float(v), 6) for v in arr]


def _calc_ema(data: np.ndarray, period: int) -> np.ndarray:
    n = len(data)
    out = np.full(n, np.nan, dtype=np.float64)
    if n >= period > 0:
        alpha = 2.0 / (period + 1.0)
        out[period - 1] = np.mean(data[:period])
        for i in range(period, n):
            out[i] = alpha * data[i] + (1.0 - alpha) * out[i - 1]
    return out


def _calc_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int) -> np.ndarray:
    n = len(high)
    atr = np.full(n, np.nan, dtype=np.float64)
    if n < period or period <= 0:
        return atr

    tr = np.zeros(n, dtype=np.float64)
    tr[0] = high[0] - low[0]
    for i in range(1, n):
        tr[i] = max(
            high[i] - low[i],
            abs(high[i] - close[i - 1]),
            abs(low[i] - close[i - 1]),
        )

    atr[period - 1] = np.mean(tr[:period])
    for i in range(period, n):
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    return atr


class ATRIndicator(Indicator):
    name = "atr"
    display_name = "Average True Range"
    category = "volatility"
    overlay = False
    default_params = {"period": 14}
    param_schema = {
        "period": {"type": "int", "min": 1, "max": 100, "default": 14},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        period = int(p["period"])
        high = frame["high"].to_numpy()
        low = frame["low"].to_numpy()
        close = frame["close"].to_numpy()
        atr = _calc_atr(high, low, close, period)
        return {"value": _to_clean_list(atr)}


class BollingerBandsIndicator(Indicator):
    name = "bollinger"
    display_name = "Bollinger Bands"
    category = "volatility"
    overlay = True
    default_params = {"period": 20, "std_dev": 2.0}
    param_schema = {
        "period": {"type": "int", "min": 1, "max": 200, "default": 20},
        "std_dev": {"type": "float", "min": 0.5, "max": 5.0, "default": 2.0},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        period = int(p["period"])
        std_dev_mult = float(p["std_dev"])

        close = frame["close"].to_numpy()
        n = len(close)

        middle = np.full(n, np.nan, dtype=np.float64)
        upper = np.full(n, np.nan, dtype=np.float64)
        lower = np.full(n, np.nan, dtype=np.float64)

        if n >= period > 0:
            for i in range(period - 1, n):
                window = close[i - period + 1 : i + 1]
                m = np.mean(window)
                std = np.std(window, ddof=0)
                middle[i] = m
                upper[i] = m + std_dev_mult * std
                lower[i] = m - std_dev_mult * std

        return {
            "middle": _to_clean_list(middle),
            "upper": _to_clean_list(upper),
            "lower": _to_clean_list(lower),
        }


class KeltnerChannelsIndicator(Indicator):
    name = "keltner"
    display_name = "Keltner Channels"
    category = "volatility"
    overlay = True
    default_params = {"ema_period": 20, "atr_period": 10, "multiplier": 2.0}
    param_schema = {
        "ema_period": {"type": "int", "min": 1, "max": 200, "default": 20},
        "atr_period": {"type": "int", "min": 1, "max": 100, "default": 10},
        "multiplier": {"type": "float", "min": 0.5, "max": 5.0, "default": 2.0},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        ema_period = int(p["ema_period"])
        atr_period = int(p["atr_period"])
        multiplier = float(p["multiplier"])

        high = frame["high"].to_numpy()
        low = frame["low"].to_numpy()
        close = frame["close"].to_numpy()

        middle = _calc_ema(close, ema_period)
        atr = _calc_atr(high, low, close, atr_period)

        upper = middle + multiplier * atr
        lower = middle - multiplier * atr

        return {
            "middle": _to_clean_list(middle),
            "upper": _to_clean_list(upper),
            "lower": _to_clean_list(lower),
        }
