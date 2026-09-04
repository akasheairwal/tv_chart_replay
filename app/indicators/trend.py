"""Trend indicators: SMA, EMA, WMA, HMA, VWAP, Supertrend (architecture ``#41``)."""
from __future__ import annotations

import math
from typing import Any, ClassVar

import numpy as np
import polars as pl

from app.indicators.base import Indicator, calc_atr, calc_ema, to_clean_list

_to_clean_list = to_clean_list
_calc_ema = calc_ema
_calc_atr = calc_atr


def _get_series(frame: pl.DataFrame, source: str = "close") -> np.ndarray:
    col = source.lower()
    if col not in frame.columns:
        col = "close"
    return frame[col].to_numpy()


def _calc_wma(data: np.ndarray, period: int) -> np.ndarray:
    n = len(data)
    out = np.full(n, np.nan, dtype=np.float64)
    if period <= 0 or n < period:
        return out

    weights = np.arange(1, period + 1, dtype=np.float64)
    w_sum = weights.sum()
    kernel = weights[::-1] / w_sum

    if np.isnan(data).any():
        for i in range(period - 1, n):
            window = data[i - period + 1 : i + 1]
            if np.any(np.isnan(window)):
                continue
            out[i] = np.dot(window, weights) / w_sum
    else:
        out[period - 1 :] = np.convolve(data, kernel, mode="valid")
    return out


class SMAIndicator(Indicator):
    name = "sma"
    display_name = "Simple Moving Average"
    category = "trend"
    overlay = True
    default_params: ClassVar[dict[str, Any]] = {"period": 14, "source": "close"}
    param_schema: ClassVar[dict[str, Any]] = {
        "period": {"type": "int", "min": 1, "max": 500, "default": 14},
        "source": {"type": "string", "options": ["close", "open", "high", "low"], "default": "close"},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        period = int(p["period"])
        data = _get_series(frame, p["source"])
        n = len(data)

        out = np.full(n, np.nan, dtype=np.float64)
        if period <= n and period > 0:
            cumsum = np.cumsum(np.insert(data, 0, 0))
            out[period - 1 :] = (cumsum[period:] - cumsum[:-period]) / period

        return {"value": _to_clean_list(out)}


class EMAIndicator(Indicator):
    name = "ema"
    display_name = "Exponential Moving Average"
    category = "trend"
    overlay = True
    default_params: ClassVar[dict[str, Any]] = {"period": 14, "source": "close"}
    param_schema: ClassVar[dict[str, Any]] = {
        "period": {"type": "int", "min": 1, "max": 500, "default": 14},
        "source": {"type": "string", "options": ["close", "open", "high", "low"], "default": "close"},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        period = int(p["period"])
        data = _get_series(frame, p["source"])
        out = calc_ema(data, period)
        return {"value": to_clean_list(out)}


class WMAIndicator(Indicator):
    name = "wma"
    display_name = "Weighted Moving Average"
    category = "trend"
    overlay = True
    default_params: ClassVar[dict[str, Any]] = {"period": 14, "source": "close"}
    param_schema: ClassVar[dict[str, Any]] = {
        "period": {"type": "int", "min": 1, "max": 500, "default": 14},
        "source": {"type": "string", "options": ["close", "open", "high", "low"], "default": "close"},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        period = int(p["period"])
        data = _get_series(frame, p["source"])
        out = _calc_wma(data, period)
        return {"value": _to_clean_list(out)}


class HMAIndicator(Indicator):
    name = "hma"
    display_name = "Hull Moving Average"
    category = "trend"
    overlay = True
    default_params: ClassVar[dict[str, Any]] = {"period": 14, "source": "close"}
    param_schema: ClassVar[dict[str, Any]] = {
        "period": {"type": "int", "min": 2, "max": 500, "default": 14},
        "source": {"type": "string", "options": ["close", "open", "high", "low"], "default": "close"},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        period = int(p["period"])
        data = _get_series(frame, p["source"])

        half_period = max(1, period // 2)
        sqrt_period = max(1, int(math.sqrt(period)))

        wma_half = _calc_wma(data, half_period)
        wma_full = _calc_wma(data, period)

        diff = 2.0 * wma_half - wma_full
        hma = _calc_wma(diff, sqrt_period)

        return {"value": _to_clean_list(hma)}


class VWAPIndicator(Indicator):
    name = "vwap"
    display_name = "Volume Weighted Average Price"
    category = "trend"
    overlay = True
    default_params: ClassVar[dict[str, Any]] = {}
    param_schema: ClassVar[dict[str, Any]] = {}

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        high = frame["high"].to_numpy()
        low = frame["low"].to_numpy()
        close = frame["close"].to_numpy()
        volume = frame["volume"].to_numpy()

        typical_price = (high + low + close) / 3.0
        pv = typical_price * volume

        cum_pv = np.cumsum(pv)
        cum_vol = np.cumsum(volume)

        with np.errstate(divide="ignore", invalid="ignore"):
            vwap = np.where(cum_vol > 0, cum_pv / cum_vol, typical_price)

        return {"value": _to_clean_list(vwap)}


class SupertrendIndicator(Indicator):
    name = "supertrend"
    display_name = "Supertrend"
    category = "trend"
    overlay = True
    default_params: ClassVar[dict[str, Any]] = {"period": 10, "multiplier": 3.0}
    param_schema: ClassVar[dict[str, Any]] = {
        "period": {"type": "int", "min": 1, "max": 100, "default": 10},
        "multiplier": {"type": "float", "min": 0.5, "max": 10.0, "default": 3.0},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        period = int(p["period"])
        multiplier = float(p["multiplier"])

        n = frame.height
        out = np.full(n, np.nan, dtype=np.float64)
        direction = np.full(n, np.nan, dtype=np.float64)

        if n < period or period <= 0:
            return {"value": _to_clean_list(out), "direction": _to_clean_list(direction)}

        high = frame["high"].to_numpy()
        low = frame["low"].to_numpy()
        close = frame["close"].to_numpy()
        atr = calc_atr(high, low, close, period)

        hl2 = (high + low) / 2.0
        upper_band = hl2 + (multiplier * atr)
        lower_band = hl2 - (multiplier * atr)

        final_upper = np.copy(upper_band)
        final_lower = np.copy(lower_band)
        trend = np.ones(n, dtype=np.int32)

        for i in range(period, n):
            if close[i - 1] > final_upper[i - 1]:
                final_upper[i] = upper_band[i]
            else:
                final_upper[i] = min(upper_band[i], final_upper[i - 1])

            if close[i - 1] < final_lower[i - 1]:
                final_lower[i] = lower_band[i]
            else:
                final_lower[i] = max(lower_band[i], final_lower[i - 1])

            if close[i] > final_upper[i - 1]:
                trend[i] = 1
            elif close[i] < final_lower[i - 1]:
                trend[i] = -1
            else:
                trend[i] = trend[i - 1]

            out[i] = final_lower[i] if trend[i] == 1 else final_upper[i]
            direction[i] = float(trend[i])

        return {"value": _to_clean_list(out), "direction": _to_clean_list(direction)}
