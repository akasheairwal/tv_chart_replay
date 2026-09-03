"""Volume indicators: OBV, MFI (architecture ``#41``)."""
from __future__ import annotations

import math
from typing import Any, ClassVar

import numpy as np
import polars as pl

from app.indicators.base import Indicator


def _to_clean_list(arr: np.ndarray) -> list[float | None]:
    return [None if np.isnan(v) or math.isnan(v) else round(float(v), 6) for v in arr]


class OBVIndicator(Indicator):
    name = "obv"
    display_name = "On-Balance Volume"
    category = "volume"
    overlay = False
    default_params: ClassVar[dict[str, Any]] = {}
    param_schema: ClassVar[dict[str, Any]] = {}

    def calculate(self, frame: pl.DataFrame, params: dict[str, Any] | None = None) -> dict[str, list[float | None]]:
        close = frame["close"].to_numpy()
        volume = frame["volume"].to_numpy()
        n = len(close)

        obv = np.zeros(n, dtype=np.float64)
        if n == 0:
            return {"value": []}

        obv[0] = volume[0]
        for i in range(1, n):
            if close[i] > close[i - 1]:
                obv[i] = obv[i - 1] + volume[i]
            elif close[i] < close[i - 1]:
                obv[i] = obv[i - 1] - volume[i]
            else:
                obv[i] = obv[i - 1]

        return {"value": _to_clean_list(obv)}


class MFIIndicator(Indicator):
    name = "mfi"
    display_name = "Money Flow Index"
    category = "volume"
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
        volume = frame["volume"].to_numpy()
        n = len(close)

        mfi = np.full(n, np.nan, dtype=np.float64)
        if n <= period or period <= 0:
            return {"value": _to_clean_list(mfi)}

        typical_price = (high + low + close) / 3.0
        raw_money_flow = typical_price * volume

        pos_flow = np.zeros(n, dtype=np.float64)
        neg_flow = np.zeros(n, dtype=np.float64)

        for i in range(1, n):
            if typical_price[i] > typical_price[i - 1]:
                pos_flow[i] = raw_money_flow[i]
            elif typical_price[i] < typical_price[i - 1]:
                neg_flow[i] = raw_money_flow[i]

        for i in range(period, n):
            pos_sum = np.sum(pos_flow[i - period + 1 : i + 1])
            neg_sum = np.sum(neg_flow[i - period + 1 : i + 1])

            if neg_sum == 0:
                mfi[i] = 50.0 if pos_sum == 0 else 100.0
            else:
                mr = pos_sum / neg_sum
                mfi[i] = 100.0 - (100.0 / (1.0 + mr))

        return {"value": _to_clean_list(mfi)}
