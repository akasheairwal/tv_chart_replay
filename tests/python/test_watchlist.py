"""
Unit tests for WatchlistManager (Wave 8).
"""

import os
import tempfile

import pytest

from app.watchlist.manager import WatchlistManager


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


def test_watchlist_default_seeding(temp_db):
    mgr = WatchlistManager(temp_db)
    items = mgr.get_watchlist()
    assert len(items) > 0
    symbols = [i.symbol for i in items]
    assert "EURUSD" in symbols
    assert "BTCUSDT" in symbols


def test_watchlist_add_and_remove(temp_db):
    mgr = WatchlistManager(temp_db)
    item = mgr.add_item("SOLUSDT", "Solana / USDT", "crypto")
    assert item.symbol == "SOLUSDT"

    items = mgr.get_watchlist()
    assert any(i.symbol == "SOLUSDT" for i in items)

    deleted = mgr.remove_item("SOLUSDT")
    assert deleted is True

    items_after = mgr.get_watchlist()
    assert not any(i.symbol == "SOLUSDT" for i in items_after)


def test_watchlist_toggle_favorite(temp_db):
    mgr = WatchlistManager(temp_db)
    mgr.add_item("ETHUSDT", "ETH / USDT", "crypto")

    # Initial favorite status
    is_fav = mgr.toggle_favorite("ETHUSDT")
    assert is_fav is True

    items = mgr.get_watchlist()
    eth = next(i for i in items if i.symbol == "ETHUSDT")
    assert eth.is_favorite is True

    # Toggle off
    is_fav_off = mgr.toggle_favorite("ETHUSDT")
    assert is_fav_off is False
