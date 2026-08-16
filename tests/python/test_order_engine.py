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


def test_modify_position_sl_tp(temp_journal):
    engine = OrderEngine(temp_journal, initial_balance=10000.0)
    engine.place_order(
        symbol="EURUSD",
        side="BUY",
        order_type="MARKET",
        quantity=1.0,
        stop_loss=1.0900,
        take_profit=1.1100,
        current_market_price=1.1000,
    )
    positions = engine.get_open_positions()
    pos_id = positions[0]["position_id"]

    # Modify SL to 1.0850 and TP to 1.1200
    res = engine.modify_position(pos_id, stop_loss=1.0850, take_profit=1.1200)
    assert res is not None
    assert res["stop_loss"] == 1.0850
    assert res["take_profit"] == 1.1200

    updated_pos = engine.get_open_positions()[0]
    assert updated_pos["stop_loss"] == 1.0850
    assert updated_pos["take_profit"] == 1.1200


def test_partial_position_close(temp_journal):
    engine = OrderEngine(temp_journal, initial_balance=10000.0)
    engine.place_order(
        symbol="EURUSD",
        side="BUY",
        order_type="MARKET",
        quantity=1.0,
        current_market_price=1.1000,
    )
    positions = engine.get_open_positions()
    pos_id = positions[0]["position_id"]

    # Close 0.40 Lots at 1.1050 (50 pips profit)
    record = engine.close_position(pos_id, current_price=1.1050, reason="PARTIAL", close_quantity=0.40)
    assert record is not None
    assert record["quantity"] == 0.40
    assert record["pnl"] > 0

    # Remaining position should have 0.60 Lots open
    remaining_positions = engine.get_open_positions()
    assert len(remaining_positions) == 1
    assert remaining_positions[0]["quantity"] == 0.60


def test_gold_and_crypto_contract_multiplier(temp_journal):
    engine = OrderEngine(temp_journal, initial_balance=10000.0)
    # 1 Lot Gold (XAUUSD) bought at 2000, closed at 2010 ($10 gain * 1 lot * 100 oz = $1000)
    order_gold = engine.place_order(
        symbol="XAUUSD",
        side="BUY",
        order_type="MARKET",
        quantity=1.0,
        current_market_price=2000.0,
    )
    pos_gold_id = engine.get_open_positions()[0]["position_id"]
    rec_gold = engine.close_position(pos_gold_id, current_price=2010.0)
    assert rec_gold["pnl"] == 1000.0

    # 1 BTC bought at 60000, closed at 61000 ($1000 gain * 1 unit * 1 = $1000)
    order_btc = engine.place_order(
        symbol="BTCUSDT",
        side="BUY",
        order_type="MARKET",
        quantity=1.0,
        current_market_price=60000.0,
    )
    pos_btc_id = engine.get_open_positions()[0]["position_id"]
    rec_btc = engine.close_position(pos_btc_id, current_price=61000.0)
    assert rec_btc["pnl"] == 1000.0


def test_replay_timestamp_persistence(temp_journal):
    engine = OrderEngine(temp_journal, initial_balance=10000.0)
    sim_time = 1700000000.0
    engine.on_replay_tick("EURUSD", 1.1000, 1.1020, 1.0980, 1.1000, timestamp=sim_time)
    order = engine.place_order(
        symbol="EURUSD",
        side="BUY",
        order_type="MARKET",
        quantity=1.0,
        current_market_price=1.1000,
        timestamp=sim_time,
    )
    assert order.created_at == sim_time
    pos_id = engine.get_open_positions()[0]["position_id"]
    close_time = sim_time + 3600.0
    engine.on_replay_tick("EURUSD", 1.1050, 1.1060, 1.1040, 1.1050, timestamp=close_time)
    rec = engine.close_position(pos_id, current_price=1.1050)
    assert rec["opened_at"] == sim_time
    assert rec["closed_at"] == close_time



