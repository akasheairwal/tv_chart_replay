"""Tests for Dukascopy DataProvider implementation."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import polars as pl
import pytest

from app.data.models.candle import CANONICAL_COLUMNS
from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import H1, M1, Timeframe
from app.data.providers.dukascopy import DukascopyProvider, _format_dukascopy_instrument


def _forex_symbol(code: str = "EURUSD") -> Symbol:
    return Symbol(symbol=code, display_name=f"{code[:3]}/{code[3:]}", asset_class=AssetClass.FOREX)


def _metal_symbol(code: str = "XAUUSD") -> Symbol:
    return Symbol(symbol=code, display_name="Gold", asset_class=AssetClass.METAL)


def _stock_symbol(code: str = "AAPL") -> Symbol:
    return Symbol(symbol=code, display_name="Apple", asset_class=AssetClass.STOCK)


def test_dukascopy_instrument_formatting() -> None:
    assert _format_dukascopy_instrument(_forex_symbol("EURUSD")) == "EUR/USD"
    assert _format_dukascopy_instrument(_metal_symbol("XAUUSD")) == "XAU/USD"
    assert _format_dukascopy_instrument(_stock_symbol("AAPL")) is None


def test_dukascopy_supports_symbol_and_timeframe() -> None:
    provider = DukascopyProvider()

    assert provider.supports_symbol(_forex_symbol("EURUSD")) is True
    assert provider.supports_symbol(_metal_symbol("XAUUSD")) is True
    assert provider.supports_symbol(_stock_symbol("AAPL")) is False

    assert provider.supports_timeframe(M1) is True
    assert provider.supports_timeframe(H1) is True
    assert provider.supports_timeframe(Timeframe("1D")) is True
    with pytest.raises(ValueError):
        Timeframe("100D")


@patch("requests.get")
def test_dukascopy_download_success(mock_get: MagicMock) -> None:
    provider = DukascopyProvider()

    # Mock Dukascopy jsonp response
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = (
        "cb([[1672610400000, 1.0697, 1.07066, 1.06788, 1.06929, 2477.42], "
        "[1672614000000, 1.06896, 1.07047, 1.06829, 1.07005, 4932.96]]);"
    )
    mock_get.return_value = mock_resp

    progress_calls = []

    def on_progress(p: float, msg: str) -> None:
        progress_calls.append((p, msg))

    df = provider.download(
        _forex_symbol("EURUSD"),
        H1,
        start_s=1672610400,
        end_s=1672614000,
        progress=on_progress,
    )

    assert isinstance(df, pl.DataFrame)
    assert df.columns == CANONICAL_COLUMNS
    assert df.height == 2
    assert df["open"][0] == 1.0697
    assert df["close"][1] == 1.07005
    assert len(progress_calls) > 0
