"""SQLite connection and transaction helpers."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.database.migrations import run_migrations


def connect(database_path: Path | str) -> sqlite3.Connection:
    """Open (and migrate) the application SQLite database."""
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False: download worker threads write through this
    # connection; SQLite's serialized mode handles concurrent access.
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA cache_size = -16000")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA mmap_size = 268435456")
    run_migrations(conn)
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Context manager wrapping a unit of work in a transaction."""
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
