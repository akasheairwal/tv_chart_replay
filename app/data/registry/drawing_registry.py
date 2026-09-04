"""SQLite persistence for chart drawings (architecture ``#51``/``#52``)."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from typing import Any


class DrawingRegistry:
    """Thread-safe SQLite storage for drawing definitions."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._lock = threading.RLock()
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        with self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS drawings (
                    id TEXT PRIMARY KEY,
                    symbol TEXT NOT NULL,
                    timeframe TEXT NOT NULL,
                    type TEXT NOT NULL,
                    definition_json TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                )
                """
            )
            self._conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_drawings_symbol_tf
                ON drawings(symbol, timeframe)
                """
            )
            self._conn.commit()

    def save_drawing(
        self,
        symbol: str,
        timeframe: str,
        drawing_id: str,
        drawing_type: str,
        definition: dict[str, Any],
    ) -> None:
        try:
            with self._lock:
                now = int(time.time())
                def_str = json.dumps(definition, separators=(",", ":"))
                self._conn.execute(
                    """
                    INSERT INTO drawings (id, symbol, timeframe, type, definition_json, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        symbol = excluded.symbol,
                        timeframe = excluded.timeframe,
                        type = excluded.type,
                        definition_json = excluded.definition_json,
                        updated_at = excluded.updated_at
                    """,
                    (
                        drawing_id,
                        symbol.upper(),
                        timeframe,
                        drawing_type,
                        def_str,
                        now,
                    ),
                )
                self._conn.commit()
        except (sqlite3.ProgrammingError, sqlite3.OperationalError):
            pass

    def load_drawings(self, symbol: str, timeframe: str) -> list[dict[str, Any]]:
        try:
            with self._lock:
                cursor = self._conn.execute(
                    """
                    SELECT definition_json FROM drawings
                    WHERE symbol = ? AND timeframe = ?
                    ORDER BY updated_at ASC
                    """,
                    (symbol.upper(), timeframe),
                )
                rows = cursor.fetchall()
                drawings: list[dict[str, Any]] = []
                for (def_json,) in rows:
                    try:
                        drawings.append(json.loads(def_json))
                    except (json.JSONDecodeError, TypeError, ValueError):
                        continue
                return drawings
        except (sqlite3.ProgrammingError, sqlite3.OperationalError):
            return []

    def delete_drawing(self, drawing_id: str) -> bool:
        try:
            with self._lock:
                cursor = self._conn.execute(
                    "DELETE FROM drawings WHERE id = ?",
                    (drawing_id,),
                )
                self._conn.commit()
                return cursor.rowcount > 0
        except (sqlite3.ProgrammingError, sqlite3.OperationalError):
            return False

    def clear_drawings(self, symbol: str, timeframe: str) -> int:
        try:
            with self._lock:
                cursor = self._conn.execute(
                    "DELETE FROM drawings WHERE symbol = ? AND timeframe = ?",
                    (symbol.upper(), timeframe),
                )
                self._conn.commit()
                return cursor.rowcount
        except (sqlite3.ProgrammingError, sqlite3.OperationalError):
            return 0
