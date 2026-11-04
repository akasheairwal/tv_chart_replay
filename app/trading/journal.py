"""
Trade Journal — SQLite persistence for executed trades & account history (Architecture §70–71).
Supports multi-tenant user trade isolation and statistics.
"""

from __future__ import annotations

import sqlite3
import threading
from typing import Any


class TradeJournal:
    """Stores closed trades, PnL records, and user trading history in SQLite."""

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
                    user_id TEXT NOT NULL DEFAULT 'local_default',
                    session_id TEXT,
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

            # Ensure columns exist if upgrading from an older table schema
            cursor = self._conn.execute("PRAGMA table_info(trade_journal)")
            cols = {row[1] for row in cursor.fetchall()}
            if "user_id" not in cols:
                self._conn.execute(
                    "ALTER TABLE trade_journal ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local_default'"
                )
            if "session_id" not in cols:
                self._conn.execute("ALTER TABLE trade_journal ADD COLUMN session_id TEXT")

            self._conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_trade_journal_closed
                ON trade_journal(closed_at DESC)
            """)
            self._conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_trade_journal_user_closed
                ON trade_journal(user_id, closed_at DESC)
            """)
            self._conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_trade_journal_user_symbol
                ON trade_journal(user_id, symbol)
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
        user_id: str = "local_default",
        session_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Records a closed trade in the persistent SQLite journal.
        """
        pnl_pct = ((exit_price - entry_price) / entry_price * 100.0) if entry_price > 0 else 0.0
        if side.upper() in ("SHORT", "SELL"):
            pnl_pct = -pnl_pct

        trade = {
            "id": trade_id,
            "user_id": user_id,
            "session_id": session_id,
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
            self._conn.execute(
                """
                INSERT OR REPLACE INTO trade_journal (
                    id, user_id, session_id, symbol, side, quantity,
                    entry_price, exit_price, pnl, pnl_percent, commission,
                    opened_at, closed_at, exit_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    trade["id"],
                    trade["user_id"],
                    trade["session_id"],
                    trade["symbol"],
                    trade["side"],
                    trade["quantity"],
                    trade["entry_price"],
                    trade["exit_price"],
                    trade["pnl"],
                    trade["pnl_percent"],
                    trade["commission"],
                    trade["opened_at"],
                    trade["closed_at"],
                    trade["exit_reason"],
                ),
            )
            self._conn.commit()
        return trade

    def get_trades(
        self,
        limit: int = 100,
        user_id: str | None = None,
        session_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Retrieves closed trades, optionally filtered by user_id or session_id.
        """
        with self._lock:
            clauses: list[str] = []
            params: list[Any] = []

            if user_id is not None:
                clauses.append("user_id = ?")
                params.append(user_id)

            if session_id is not None:
                clauses.append("session_id = ?")
                params.append(session_id)

            where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            query = f"""
                SELECT id, symbol, side, quantity, entry_price, exit_price,
                       pnl, pnl_percent, commission, opened_at, closed_at,
                       exit_reason, user_id, session_id
                FROM trade_journal
                {where_sql}
                ORDER BY closed_at DESC
                LIMIT ?
            """
            params.append(limit)

            cursor = self._conn.execute(query, tuple(params))
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
                    "user_id": r[12],
                    "session_id": r[13],
                }
                for r in rows
            ]

    def get_user_stats(self, user_id: str) -> dict[str, Any]:
        """
        Calculates aggregate trading performance statistics for a specific user.
        """
        with self._lock:
            cursor = self._conn.execute(
                """
                SELECT pnl FROM trade_journal WHERE user_id = ?
                """,
                (user_id,),
            )
            pnls = [float(r[0]) for r in cursor.fetchall()]

        total_trades = len(pnls)
        if total_trades == 0:
            return {
                "user_id": user_id,
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "break_even_trades": 0,
                "win_rate": 0.0,
                "total_pnl": 0.0,
                "profit_factor": 0.0,
                "gross_profit": 0.0,
                "gross_loss": 0.0,
            }

        winning = [p for p in pnls if p > 0.0]
        losing = [p for p in pnls if p < 0.0]
        break_even = [p for p in pnls if p == 0.0]

        gross_profit = sum(winning)
        gross_loss = abs(sum(losing))
        total_pnl = sum(pnls)

        win_rate = (len(winning) / total_trades) * 100.0
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0.0)

        return {
            "user_id": user_id,
            "total_trades": total_trades,
            "winning_trades": len(winning),
            "losing_trades": len(losing),
            "break_even_trades": len(break_even),
            "win_rate": round(win_rate, 2),
            "total_pnl": round(total_pnl, 2),
            "profit_factor": round(profit_factor, 2),
            "gross_profit": round(gross_profit, 2),
            "gross_loss": round(gross_loss, 2),
        }

    def clear(self, user_id: str | None = None) -> None:
        """Clears trade records. If user_id is provided, only deletes that user's trades."""
        with self._lock:
            if user_id is not None:
                self._conn.execute("DELETE FROM trade_journal WHERE user_id = ?", (user_id,))
            else:
                self._conn.execute("DELETE FROM trade_journal")
            self._conn.commit()

    def close(self) -> None:
        """Closes the underlying SQLite connection."""
        with self._lock:
            self._conn.close()
