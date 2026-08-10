"""
Watchlist Manager — thread-safe SQLite persistence for user watchlist and favorites.
"""

import sqlite3
import threading
import time

from typing import Any, List, Optional

from app.watchlist.models import WatchlistItem

DEFAULT_WATCHLIST = [
    WatchlistItem("EURUSD", "EUR / USD", "forex", True, 1.0),
    WatchlistItem("GBPUSD", "GBP / USD", "forex", True, 2.0),
    WatchlistItem("USDJPY", "USD / JPY", "forex", False, 3.0),
    WatchlistItem("BTCUSDT", "BTC / USDT", "crypto", True, 4.0),
    WatchlistItem("ETHUSDT", "ETH / USDT", "crypto", False, 5.0),
    WatchlistItem("XAUUSD", "Gold / USD", "commodity", True, 6.0),
    WatchlistItem("SPY", "S&P 500 ETF", "stock", False, 7.0),
]


class WatchlistManager:
    """Manages watchlist symbols with database storage."""

    def __init__(self, db_path: str | Any):
        self.db_path = str(db_path)
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        with self._lock, sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS watchlist (
                    symbol TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    asset_type TEXT NOT NULL DEFAULT 'forex',
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    added_at REAL NOT NULL
                )
            """)
            conn.commit()

            # Seed default watchlist if table is empty
            cursor = conn.execute("SELECT COUNT(*) FROM watchlist")
            if cursor.fetchone()[0] == 0:
                for item in DEFAULT_WATCHLIST:
                    conn.execute("""
                        INSERT OR IGNORE INTO watchlist (symbol, display_name, asset_type, is_favorite, added_at)
                        VALUES (?, ?, ?, ?, ?)
                    """, (item.symbol, item.display_name, item.asset_type, 1 if item.is_favorite else 0, item.added_at))
                conn.commit()

    def get_watchlist(self) -> list[WatchlistItem]:
        """Return all watchlist items ordered by favorites first, then added_at."""
        with self._lock, sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT symbol, display_name, asset_type, is_favorite, added_at
                FROM watchlist
                ORDER BY is_favorite DESC, added_at ASC
            """)
            rows = cursor.fetchall()
            return [
                WatchlistItem(
                    symbol=r[0],
                    display_name=r[1],
                    asset_type=r[2],
                    is_favorite=bool(r[3]),
                    added_at=r[4],
                )
                for r in rows
            ]

    def add_item(self, symbol: str, display_name: str | None = None, asset_type: str = "forex") -> WatchlistItem:
        """Add or update an item in the watchlist."""
        sym_clean = symbol.upper().strip()
        disp = display_name or sym_clean
        now = time.time()
        with self._lock, sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO watchlist (symbol, display_name, asset_type, is_favorite, added_at)
                VALUES (?, ?, ?, 0, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    display_name = excluded.display_name,
                    asset_type = excluded.asset_type
            """, (sym_clean, disp, asset_type, now))
            conn.commit()
        return WatchlistItem(sym_clean, disp, asset_type, False, now)

    def remove_item(self, symbol: str) -> bool:
        """Remove a symbol from the watchlist."""
        sym_clean = symbol.upper().strip()
        with self._lock, sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("DELETE FROM watchlist WHERE symbol = ?", (sym_clean,))
            conn.commit()
            return cursor.rowcount > 0

    def toggle_favorite(self, symbol: str) -> bool:
        """Toggle favorite status of a watchlist symbol."""
        sym_clean = symbol.upper().strip()
        with self._lock, sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT is_favorite FROM watchlist WHERE symbol = ?", (sym_clean,))
            row = cursor.fetchone()
            if not row:
                return False
            new_fav = 0 if row[0] else 1
            conn.execute("UPDATE watchlist SET is_favorite = ? WHERE symbol = ?", (new_fav, sym_clean))
            conn.commit()
            return bool(new_fav)
