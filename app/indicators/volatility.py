"""Volatility indicators: ATR, Bollinger Bands, Keltner Channels (architecture ``#41``)."""
from __future__ import annotations

from typing import Any, ClassVar

import numpy as np
import polars as pl

from app.indicators.base import Indicator, calc_atr, calc_ema, to_clean_list

_to_clean_list = to_clean_list
_calc_ema = calc_ema
_calc_atr = calc_atr


class ATRIndicator(Indicator):
    name = "atr"
    display_name = "Average True Range"
    category = "volatility"
    overlay = False
    default_params: ClassVar[dict[str, Any]] = {"period": 14}
    param_schema: ClassVar[dict[str, Any]] = {
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
    default_params: ClassVar[dict[str, Any]] = {"period": 20, "std_dev": 2.0}
    param_schema: ClassVar[dict[str, Any]] = {
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
            s_close = pl.Series(close)
            middle = s_close.rolling_mean(period).to_numpy()
            std = s_close.rolling_std(period, ddof=0).to_numpy()
            upper = middle + std_dev_mult * std
            lower = middle - std_dev_mult * std

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
    default_params: ClassVar[dict[str, Any]] = {"ema_period": 20, "atr_period": 10, "multiplier": 2.0}
    param_schema: ClassVar[dict[str, Any]] = {
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
