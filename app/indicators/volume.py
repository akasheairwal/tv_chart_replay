"""Volume indicators: OBV, MFI (architecture ``#41``)."""
from __future__ import annotations

import math
from typing import Any, ClassVar

import numpy as np
import polars as pl

from app.indicators.base import Indicator


def _to_clean_list(arr: np.ndarray) -> list[float | None]:
    isnan = math.isnan
    round_ = round
    float_ = float
    return [None if isnan(v) else round_(float_(v), 6) for v in arr]


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

        if n == 0:
            return {"value": []}

        diff = np.diff(close)
        direction = np.sign(diff)
        steps = direction * volume[1:]
        obv = np.empty(n, dtype=np.float64)
        obv[0] = volume[0]
        obv[1:] = volume[0] + np.cumsum(steps)

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

        if n > 1:
            diff_tp = np.diff(typical_price)
            pos_flow[1:][diff_tp > 0] = raw_money_flow[1:][diff_tp > 0]
            neg_flow[1:][diff_tp < 0] = raw_money_flow[1:][diff_tp < 0]

        pos_sum = pl.Series(pos_flow).rolling_sum(period).to_numpy()
        neg_sum = pl.Series(neg_flow).rolling_sum(period).to_numpy()

        for i in range(period, n):
            p_sum = pos_sum[i]
            n_sum = neg_sum[i]

            if n_sum == 0:
                mfi[i] = 50.0 if p_sum == 0 else 100.0
            else:
                mr = p_sum / n_sum
                mfi[i] = 100.0 - (100.0 / (1.0 + mr))

        return {"value": _to_clean_list(mfi)}
