"""Schema migrations (SQLite).

``run_migrations`` is idempotent: it creates the Wave-1 tables (dataset
registry, coverage intervals, symbol registry) and records the schema
version in ``meta``.
"""

from __future__ import annotations

import sqlite3

SCHEMA_VERSION = 1

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
"""


def run_migrations(conn: sqlite3.Connection) -> None:
    """Apply the schema and record the current version."""
    conn.executescript(DDL)
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
        (str(SCHEMA_VERSION),),
    )
    conn.commit()
