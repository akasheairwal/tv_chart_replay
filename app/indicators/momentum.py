"""Momentum indicators: RSI, MACD, Stochastic (architecture ``#41``)."""
from __future__ import annotations

import math
from typing import Any, ClassVar

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


class RSIIndicator(Indicator):
    name = "rsi"
    display_name = "Relative Strength Index"
    category = "momentum"
    overlay = False
    default_params: ClassVar[dict[str, Any]] = {"period": 14, "source": "close"}
    param_schema: ClassVar[dict[str, Any]] = {
        "period": {"type": "int", "min": 1, "max": 200, "default": 14},
        "source": {"type": "string", "options": ["close", "open", "high", "low"], "default": "close"},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        period = int(p["period"])
        source = p.get("source", "close").lower()
        if source not in frame.columns:
            source = "close"

        close = frame[source].to_numpy()
        n = len(close)
        rsi = np.full(n, np.nan, dtype=np.float64)

        if n <= period or period <= 0:
            return {"value": _to_clean_list(rsi)}

        delta = np.diff(close)
        gains = np.where(delta > 0, delta, 0.0)
        losses = np.where(delta < 0, -delta, 0.0)

        avg_gain = np.mean(gains[:period])
        avg_loss = np.mean(losses[:period])

        if avg_loss == 0:
            rsi[period] = 50.0 if avg_gain == 0 else 100.0
        else:
            rs = avg_gain / avg_loss
            rsi[period] = 100.0 - (100.0 / (1.0 + rs))

        for i in range(period + 1, n):
            g = gains[i - 1]
            l = losses[i - 1]
            avg_gain = (avg_gain * (period - 1) + g) / period
            avg_loss = (avg_loss * (period - 1) + l) / period

            if avg_loss == 0:
                rsi[i] = 50.0 if avg_gain == 0 else 100.0
            else:
                rs = avg_gain / avg_loss
                rsi[i] = 100.0 - (100.0 / (1.0 + rs))

        return {"value": _to_clean_list(rsi)}


class MACDIndicator(Indicator):
    name = "macd"
    display_name = "Moving Average Convergence Divergence"
    category = "momentum"
    overlay = False
    default_params: ClassVar[dict[str, Any]] = {"fast_period": 12, "slow_period": 26, "signal_period": 9}
    param_schema: ClassVar[dict[str, Any]] = {
        "fast_period": {"type": "int", "min": 1, "max": 100, "default": 12},
        "slow_period": {"type": "int", "min": 1, "max": 200, "default": 26},
        "signal_period": {"type": "int", "min": 1, "max": 100, "default": 9},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        fast = int(p["fast_period"])
        slow = int(p["slow_period"])
        signal = int(p["signal_period"])

        close = frame["close"].to_numpy()
        n = len(close)

        fast_ema = _calc_ema(close, fast)
        slow_ema = _calc_ema(close, slow)

        macd_line = fast_ema - slow_ema

        # Calculate signal EMA over macd_line valid portion
        signal_line = np.full(n, np.nan, dtype=np.float64)
        valid_start = slow - 1
        if n > valid_start + signal:
            valid_macd = macd_line[valid_start:]
            sig_calc = _calc_ema(valid_macd, signal)
            signal_line[valid_start:] = sig_calc

        histogram = macd_line - signal_line

        return {
            "macd": _to_clean_list(macd_line),
            "signal": _to_clean_list(signal_line),
            "histogram": _to_clean_list(histogram),
        }


class StochasticIndicator(Indicator):
    name = "stochastic"
    display_name = "Stochastic Oscillator"
    category = "momentum"
    overlay = False
    default_params: ClassVar[dict[str, Any]] = {"k_period": 14, "d_period": 3, "smooth_k": 3}
    param_schema: ClassVar[dict[str, Any]] = {
        "k_period": {"type": "int", "min": 1, "max": 100, "default": 14},
        "d_period": {"type": "int", "min": 1, "max": 50, "default": 3},
        "smooth_k": {"type": "int", "min": 1, "max": 50, "default": 3},
    }

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        p = {**self.default_params, **(params or {})}
        k_period = int(p["k_period"])
        d_period = int(p["d_period"])
        smooth_k = int(p["smooth_k"])

        high = frame["high"].to_numpy()
        low = frame["low"].to_numpy()
        close = frame["close"].to_numpy()
        n = len(close)

        fast_k = np.full(n, np.nan, dtype=np.float64)

        if n >= k_period > 0:
            for i in range(k_period - 1, n):
                h = np.max(high[i - k_period + 1 : i + 1])
                l = np.min(low[i - k_period + 1 : i + 1])
                if h == l:
                    fast_k[i] = 50.0
                else:
                    fast_k[i] = 100.0 * (close[i] - l) / (h - l)

        # Smooth %K
        k = np.full(n, np.nan, dtype=np.float64)
        if smooth_k > 1:
            for i in range(k_period - 1 + smooth_k - 1, n):
                window = fast_k[i - smooth_k + 1 : i + 1]
                if not np.any(np.isnan(window)):
                    k[i] = np.mean(window)
        else:
            k = fast_k

        # %D is SMA of %K
        d = np.full(n, np.nan, dtype=np.float64)
        if d_period > 0:
            for i in range(d_period - 1, n):
                window = k[i - d_period + 1 : i + 1]
                if not np.any(np.isnan(window)):
                    d[i] = np.mean(window)

        return {"k": _to_clean_list(k), "d": _to_clean_list(d)}
