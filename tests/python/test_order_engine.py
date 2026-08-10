"""
Unit tests for OrderEngine & Position Manager (Wave 9 / Phase 10).
"""

import os
import tempfile

import pytest

from app.trading.journal import TradeJournal
from app.trading.order_engine import OrderEngine


@pytest.fixture
def temp_journal():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    journal = TradeJournal(path)
    yield journal
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


def test_place_market_order(temp_journal):
    engine = OrderEngine(temp_journal, initial_balance=10000.0)
    order = engine.place_order(
        symbol="EURUSD",
        side="BUY",
        order_type="MARKET",
        quantity=1.0,
        current_market_price=1.1000,
    )
    assert order.status == "FILLED"
    assert order.filled_price == 1.1000
    positions = engine.get_open_positions()
    assert len(positions) == 1
    assert positions[0]["symbol"] == "EURUSD"
    assert positions[0]["side"] == "LONG"


def test_limit_order_execution(temp_journal):
    engine = OrderEngine(temp_journal)
    order = engine.place_order(
        symbol="EURUSD",
        side="BUY",
        order_type="LIMIT",
        quantity=1.0,
        price=1.0950,
    )
    assert order.status == "PENDING"

    # Candle low reaches limit price
    events = engine.on_replay_tick("EURUSD", open_p=1.0990, high_p=1.1000, low_p=1.0940, close_p=1.0960)
    assert len(events) == 1
    assert events[0]["event"] == "order_filled"
    assert order.status == "FILLED"


def test_position_tp_sl_trigger(temp_journal):
    engine = OrderEngine(temp_journal, initial_balance=10000.0)
    engine.place_order(
        symbol="EURUSD",
        side="BUY",
        order_type="MARKET",
        quantity=100.0,
        stop_loss=1.0900,
        take_profit=1.1100,
        current_market_price=1.1000,
    )

    # Tick touches TP level (1.1100)
    events = engine.on_replay_tick("EURUSD", open_p=1.1020, high_p=1.1120, low_p=1.1010, close_p=1.1110)
    assert any(e.get("reason") == "TAKE_PROFIT" for e in events)

    # Position should be closed
    assert len(engine.get_open_positions()) == 0

    # Account balance updated
    summary = engine.get_account_summary()
    assert summary["balance"] > 10000.0
    assert summary["total_trades"] == 1
    assert summary["winning_trades"] == 1
