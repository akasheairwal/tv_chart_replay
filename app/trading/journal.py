"""
Trade Journal — SQLite persistence for executed trades & account history (Architecture §70–71).
"""

import sqlite3
import threading
from typing import Any


class TradeJournal:
    """Stores closed trades, PnL records, and equity snapshots in SQLite."""

    def __init__(self, db_path: str | Any):
        self.db_path = str(db_path)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.execute("PRAGMA synchronous = NORMAL")
        self._conn.execute("PRAGMA busy_timeout = 5000")
        self._conn.execute("PRAGMA cache_size = -8000")
        self._init_db()

    def _init_db(self) -> None:
        with self._lock:
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS trade_journal (
                    id TEXT PRIMARY KEY,
                    symbol TEXT NOT NULL,
                    side TEXT NOT NULL,
                    quantity REAL NOT NULL,
                    entry_price REAL NOT NULL,
                    exit_price REAL NOT NULL,
                    pnl REAL NOT NULL,
                    pnl_percent REAL NOT NULL,
                    commission REAL NOT NULL DEFAULT 0.0,
                    opened_at REAL NOT NULL,
                    closed_at REAL NOT NULL,
                    exit_reason TEXT NOT NULL
                )
            """)
            self._conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_trade_journal_closed
                ON trade_journal(closed_at DESC)
            """)
            self._conn.commit()

    def record_trade(
        self,
        trade_id: str,
        symbol: str,
        side: str,
        quantity: float,
        entry_price: float,
        exit_price: float,
        pnl: float,
        commission: float = 0.0,
        opened_at: float = 0.0,
        closed_at: float = 0.0,
        exit_reason: str = "MANUAL",
    ) -> dict[str, Any]:
        pnl_pct = ((exit_price - entry_price) / entry_price * 100.0) if entry_price > 0 else 0.0
        if side.upper() in ("SHORT", "SELL"):
            pnl_pct = -pnl_pct

        trade = {
            "id": trade_id,
            "symbol": symbol,
            "side": side,
            "quantity": quantity,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "pnl": round(pnl, 2),
            "pnl_percent": round(pnl_pct, 2),
            "commission": round(commission, 2),
            "opened_at": opened_at,
            "closed_at": closed_at,
            "exit_reason": exit_reason,
        }

        with self._lock:
            self._conn.execute("""
                INSERT OR REPLACE INTO trade_journal (
                    id, symbol, side, quantity, entry_price, exit_price, pnl, pnl_percent, commission, opened_at, closed_at, exit_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                trade["id"], trade["symbol"], trade["side"], trade["quantity"],
                trade["entry_price"], trade["exit_price"], trade["pnl"], trade["pnl_percent"],
                trade["commission"], trade["opened_at"], trade["closed_at"], trade["exit_reason"]
            ))
            self._conn.commit()
        return trade

    def get_trades(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            cursor = self._conn.execute("""
                SELECT id, symbol, side, quantity, entry_price, exit_price, pnl, pnl_percent, commission, opened_at, closed_at, exit_reason
                FROM trade_journal
                ORDER BY closed_at DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [
                {
                    "id": r[0],
                    "symbol": r[1],
                    "side": r[2],
                    "quantity": r[3],
                    "entry_price": r[4],
                    "exit_price": r[5],
                    "pnl": r[6],
                    "pnl_percent": r[7],
                    "commission": r[8],
                    "opened_at": r[9],
                    "closed_at": r[10],
                    "exit_reason": r[11],
                }
                for r in rows
            ]

    def clear(self) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM trade_journal")
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()
