"""Tests for Technical Indicators Engine (Architecture ``#40``–``#42``)."""
import polars as pl

from app.indicators.engine import IndicatorEngine


def _make_sample_frame(count: int = 100) -> pl.DataFrame:
    rows = []
    price = 100.0
    for i in range(count):
        ts = 1700000000 + i * 3600
        op = price
        hi = price + 2.0 + (i % 3)
        lo = price - 2.0 - (i % 2)
        cl = price + (1.0 if i % 2 == 0 else -0.5)
        vol = 1000.0 + (i * 10)
        rows.append([ts, op, hi, lo, cl, vol])
        price = cl

    return pl.DataFrame(
        rows,
        schema=[("timestamp", pl.Int64), ("open", pl.Float64), ("high", pl.Float64), ("low", pl.Float64), ("close", pl.Float64), ("volume", pl.Float64)],
        orient="row",
    )


def test_indicator_catalog():
    engine = IndicatorEngine()
    catalog = engine.get_catalog()
    assert len(catalog) == 14  # 6 trend, 3 momentum, 3 volatility, 2 volume
    names = {ind["name"] for ind in catalog}
    expected = {
        "sma", "ema", "wma", "hma", "vwap", "supertrend",
        "rsi", "macd", "stochastic",
        "atr", "bollinger", "keltner",
        "obv", "mfi"
    }
    assert expected.issubset(names)


def test_trend_indicators():
    engine = IndicatorEngine()
    frame = _make_sample_frame(50)

    # SMA
    sma = engine.calculate("sma", frame, {"period": 10})
    assert len(sma["lines"]["value"]) == 50
    assert sma["lines"]["value"][0] is None
    assert sma["lines"]["value"][9] is not None

    # EMA
    ema = engine.calculate("ema", frame, {"period": 10})
    assert len(ema["lines"]["value"]) == 50
    assert ema["lines"]["value"][9] is not None

    # WMA
    wma = engine.calculate("wma", frame, {"period": 10})
    assert len(wma["lines"]["value"]) == 50
    assert wma["lines"]["value"][9] is not None

    # HMA
    hma = engine.calculate("hma", frame, {"period": 16})
    assert len(hma["lines"]["value"]) == 50
    assert hma["lines"]["value"][-1] is not None

    # VWAP
    vwap = engine.calculate("vwap", frame)
    assert len(vwap["lines"]["value"]) == 50
    assert vwap["lines"]["value"][0] is not None

    # Supertrend
    st = engine.calculate("supertrend", frame, {"period": 10, "multiplier": 3.0})
    assert len(st["lines"]["value"]) == 50
    assert len(st["lines"]["direction"]) == 50
    assert st["lines"]["value"][10] is not None


def test_momentum_indicators():
    engine = IndicatorEngine()
    frame = _make_sample_frame(60)

    # RSI
    rsi = engine.calculate("rsi", frame, {"period": 14})
    assert len(rsi["lines"]["value"]) == 60
    assert rsi["lines"]["value"][14] is not None
    # RSI values should be between 0 and 100
    valid_rsi = [v for v in rsi["lines"]["value"] if v is not None]
    assert all(0.0 <= v <= 100.0 for v in valid_rsi)

    # MACD
    macd = engine.calculate("macd", frame, {"fast_period": 12, "slow_period": 26, "signal_period": 9})
    assert "macd" in macd["lines"]
    assert "signal" in macd["lines"]
    assert "histogram" in macd["lines"]
    assert len(macd["lines"]["macd"]) == 60

    # Stochastic
    stoch = engine.calculate("stochastic", frame, {"k_period": 14, "d_period": 3, "smooth_k": 3})
    assert "k" in stoch["lines"]
    assert "d" in stoch["lines"]
    valid_k = [v for v in stoch["lines"]["k"] if v is not None]
    assert all(0.0 <= v <= 100.0 for v in valid_k)


def test_volatility_indicators():
    engine = IndicatorEngine()
    frame = _make_sample_frame(50)

    # ATR
    atr = engine.calculate("atr", frame, {"period": 14})
    assert len(atr["lines"]["value"]) == 50
    assert atr["lines"]["value"][13] is not None
    assert all(v > 0 for v in atr["lines"]["value"] if v is not None)

    # Bollinger Bands
    bb = engine.calculate("bollinger", frame, {"period": 20, "std_dev": 2.0})
    assert "upper" in bb["lines"]
    assert "middle" in bb["lines"]
    assert "lower" in bb["lines"]
    assert bb["lines"]["upper"][-1] >= bb["lines"]["middle"][-1] >= bb["lines"]["lower"][-1]

    # Keltner Channels
    kc = engine.calculate("keltner", frame, {"ema_period": 20, "atr_period": 10, "multiplier": 2.0})
    assert "upper" in kc["lines"]
    assert "middle" in kc["lines"]
    assert "lower" in kc["lines"]
    assert kc["lines"]["upper"][-1] >= kc["lines"]["middle"][-1] >= kc["lines"]["lower"][-1]


def test_volume_indicators():
    engine = IndicatorEngine()
    frame = _make_sample_frame(50)

    # OBV
    obv = engine.calculate("obv", frame)
    assert len(obv["lines"]["value"]) == 50
    assert obv["lines"]["value"][0] is not None

    # MFI
    mfi = engine.calculate("mfi", frame, {"period": 14})
    assert len(mfi["lines"]["value"]) == 50
    valid_mfi = [v for v in mfi["lines"]["value"] if v is not None]
    assert all(0.0 <= v <= 100.0 for v in valid_mfi)


def test_replay_aware_isolation():
    """Verify indicators strictly computed on visible slice cannot access future candles."""
    from app.replay.isolation import IsolatedDataset
    frame = _make_sample_frame(100)
    dataset = IsolatedDataset(frame)

    # Slice visible at index 30
    visible = dataset.slice_visible(30)
    assert visible.height == 31

    engine = IndicatorEngine()
    res = engine.calculate("sma", visible, {"period": 10})
    assert len(res["lines"]["value"]) == 31
    assert res["timestamps"][-1] == visible["timestamp"][-1]
