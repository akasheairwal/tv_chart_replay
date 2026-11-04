"""Schema migrations (SQLite).

``run_migrations`` is idempotent: it creates application tables (dataset registry,
coverage intervals, symbol registry, users, sessions, and trade journal)
and records the schema version in ``meta``.
"""

from __future__ import annotations

import sqlite3

SCHEMA_VERSION = 2

DDL = """
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS datasets (
    dataset_id      TEXT PRIMARY KEY,
    symbol          TEXT NOT NULL,
    asset_class     TEXT NOT NULL,
    exchange        TEXT,
    provider        TEXT NOT NULL,
    timeframe       TEXT NOT NULL,
    start_timestamp INTEGER,
    end_timestamp   INTEGER,
    row_count       INTEGER DEFAULT 0,
    file_path       TEXT,
    file_size       INTEGER,
    checksum        TEXT,
    timezone        TEXT DEFAULT 'UTC',
    schema_version  TEXT NOT NULL,
    dataset_version INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'MISSING',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_datasets_symbol_tf ON datasets(symbol, timeframe);
CREATE INDEX IF NOT EXISTS idx_datasets_status ON datasets(status);

CREATE TABLE IF NOT EXISTS coverage (
    dataset_id      TEXT NOT NULL,
    start_timestamp INTEGER NOT NULL,
    end_timestamp   INTEGER NOT NULL,
    provider        TEXT NOT NULL,
    PRIMARY KEY (dataset_id, start_timestamp),
    FOREIGN KEY (dataset_id) REFERENCES datasets(dataset_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_coverage_dataset ON coverage(dataset_id);

CREATE TABLE IF NOT EXISTS symbols (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol       TEXT NOT NULL UNIQUE,
    display_name TEXT,
    asset_class  TEXT NOT NULL,
    exchange     TEXT,
    timezone     TEXT DEFAULT 'UTC',
    providers    TEXT,
    favorite     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT NOT NULL,
    salt            TEXT NOT NULL,
    initial_balance REAL NOT NULL DEFAULT 10000.0,
    balance         REAL NOT NULL DEFAULT 10000.0,
    created_at      TEXT NOT NULL,
    last_login_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_sessions (
    token           TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    expires_at      INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS trade_journal (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL DEFAULT 'local_default',
    session_id      TEXT,
    symbol          TEXT NOT NULL,
    side            TEXT NOT NULL,
    quantity        REAL NOT NULL,
    entry_price     REAL NOT NULL,
    exit_price      REAL NOT NULL,
    pnl             REAL NOT NULL,
    pnl_percent     REAL NOT NULL,
    commission      REAL NOT NULL DEFAULT 0.0,
    opened_at       REAL NOT NULL,
    closed_at       REAL NOT NULL,
    exit_reason     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trade_journal_closed ON trade_journal(closed_at DESC);
"""


def _migrate_trade_journal_columns(conn: sqlite3.Connection) -> None:
    """Ensure user_id and session_id columns and indexes exist if upgrading from older tables."""
    cursor = conn.execute("PRAGMA table_info(trade_journal)")
    cols = {row[1] for row in cursor.fetchall()}
    if cols:
        if "user_id" not in cols:
            conn.execute(
                "ALTER TABLE trade_journal ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local_default'"
            )
        if "session_id" not in cols:
            conn.execute("ALTER TABLE trade_journal ADD COLUMN session_id TEXT")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trade_journal_user_closed ON trade_journal(user_id, closed_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trade_journal_user_symbol ON trade_journal(user_id, symbol)"
        )


def run_migrations(conn: sqlite3.Connection) -> None:
    """Apply the schema, perform any column migrations, and record the current version."""
    conn.executescript(DDL)
    _migrate_trade_journal_columns(conn)
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
        (str(SCHEMA_VERSION),),
    )
    conn.commit()
