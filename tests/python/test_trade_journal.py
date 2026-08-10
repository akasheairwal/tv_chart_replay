"""
Unit tests for TradeJournal persistence (Wave 9).
"""

import os
import tempfile

import pytest

from app.trading.journal import TradeJournal


@pytest.fixture
def temp_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    yield path
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


def test_trade_journal_record_and_retrieve(temp_db):
    journal = TradeJournal(temp_db)
    record = journal.record_trade(
        trade_id="trade_101",
        symbol="EURUSD",
        side="LONG",
        quantity=1.0,
        entry_price=1.1000,
        exit_price=1.1100,
        pnl=100.0,
        opened_at=1000.0,
        closed_at=1050.0,
        exit_reason="TAKE_PROFIT",
    )

    assert record["id"] == "trade_101"
    assert record["pnl"] == 100.0

    trades = journal.get_trades()
    assert len(trades) == 1
    assert trades[0]["symbol"] == "EURUSD"
    assert trades[0]["exit_reason"] == "TAKE_PROFIT"
