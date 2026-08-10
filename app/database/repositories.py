"""Thin SQLite repositories used by the data registries."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(frozen=True)
class StoredDataset:
    """Row of the ``datasets`` table (architecture ``#23``)."""

    dataset_id: str
    symbol: str
    asset_class: str
    exchange: str | None = None
    provider: str = ""
    timeframe: str = ""
    start_timestamp: int | None = None
    end_timestamp: int | None = None
    row_count: int = 0
    file_path: str | None = None
    file_size: int | None = None
    checksum: str | None = None
    timezone: str = "UTC"
    schema_version: str = "1.0"
    dataset_version: int = 1
    status: str = "MISSING"
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}


DATASET_FIELDS = (
    "dataset_id",
    "symbol",
    "asset_class",
    "exchange",
    "provider",
    "timeframe",
    "start_timestamp",
    "end_timestamp",
    "row_count",
    "file_path",
    "file_size",
    "checksum",
    "timezone",
    "schema_version",
    "dataset_version",
    "status",
    "created_at",
    "updated_at",
)


class DatasetRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def upsert(self, row: StoredDataset) -> None:
        self._conn.execute(
            f"""
            INSERT INTO datasets ({", ".join(DATASET_FIELDS)})
            VALUES ({", ".join("?" for _ in DATASET_FIELDS)})
            ON CONFLICT(dataset_id) DO UPDATE SET
              provider = excluded.provider,
              start_timestamp = excluded.start_timestamp,
              end_timestamp = excluded.end_timestamp,
              row_count = excluded.row_count,
              file_path = excluded.file_path,
              file_size = excluded.file_size,
              checksum = excluded.checksum,
              schema_version = excluded.schema_version,
              dataset_version = excluded.dataset_version,
              status = excluded.status,
              updated_at = excluded.updated_at
            """,
            tuple(getattr(row, f) for f in DATASET_FIELDS),
        )
        self._conn.commit()

    def get(self, dataset_id: str) -> StoredDataset | None:
        cur = self._conn.execute("SELECT * FROM datasets WHERE dataset_id = ?", (dataset_id,))
        row = cur.fetchone()
        return self._to_model(row) if row else None

    def get_by_symbol_timeframe(self, symbol: str, timeframe: object) -> StoredDataset | None:
        tf_str = str(getattr(timeframe, "freq", timeframe))
        cur = self._conn.execute(
            "SELECT * FROM datasets WHERE symbol = ? AND timeframe = ?",
            (symbol, tf_str),
        )
        row = cur.fetchone()
        return self._to_model(row) if row else None

    def list_all(self) -> list[StoredDataset]:
        cur = self._conn.execute("SELECT * FROM datasets ORDER BY symbol, timeframe")
        return [self._to_model(r) for r in cur.fetchall()]

    def set_status(self, dataset_id: str, status: str) -> None:
        self._conn.execute(
            "UPDATE datasets SET status = ?, updated_at = ? WHERE dataset_id = ?",
            (status, now_iso(), dataset_id),
        )
        self._conn.commit()

    def bump_version(self, dataset_id: str) -> int:
        self._conn.execute(
            "UPDATE datasets SET dataset_version = dataset_version + 1, updated_at = ? "
            "WHERE dataset_id = ?",
            (now_iso(), dataset_id),
        )
        self._conn.commit()
        row = self._conn.execute(
            "SELECT dataset_version FROM datasets WHERE dataset_id = ?", (dataset_id,)
        ).fetchone()
        return int(row["dataset_version"]) if row else 1

    def delete(self, dataset_id: str) -> None:
        self._conn.execute("DELETE FROM datasets WHERE dataset_id = ?", (dataset_id,))
        self._conn.commit()

    @staticmethod
    def _to_model(row: sqlite3.Row) -> StoredDataset:
        return StoredDataset(**dict(row))


class CoverageRepository:
    """Disjoint coverage intervals per dataset (merged on write)."""

    ADJACENCY_TOLERANCE_S = 15

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def add(self, dataset_id: str, start: int, end: int, provider: str) -> None:
        self._conn.execute(
            "INSERT OR REPLACE INTO coverage (dataset_id, start_timestamp, end_timestamp, provider) "
            "VALUES (?, ?, ?, ?)",
            (dataset_id, start, end, provider),
        )
        self._conn.commit()
        self._reconcile(dataset_id)

    def intervals(self, dataset_id: str) -> list[tuple[int, int]]:
        cur = self._conn.execute(
            "SELECT start_timestamp, end_timestamp FROM coverage "
            "WHERE dataset_id = ? ORDER BY start_timestamp",
            (dataset_id,),
        )
        return [(int(r["start_timestamp"]), int(r["end_timestamp"])) for r in cur.fetchall()]

    def clear(self, dataset_id: str) -> None:
        self._conn.execute("DELETE FROM coverage WHERE dataset_id = ?", (dataset_id,))
        self._conn.commit()

    def delete_dataset(self, dataset_id: str) -> None:
        self.clear(dataset_id)

    def missing(
        self, dataset_id: str, requested_start: int, requested_end: int
    ) -> list[tuple[int, int]]:
        """Missing sub-intervals inside ``[requested_start, requested_end]``."""
        if requested_end < requested_start:
            return []
        covered = self.intervals(dataset_id)
        missing: list[tuple[int, int]] = []
        cursor = requested_start
        for start, end in covered:
            if end < cursor:
                continue
            if start > requested_end:
                break
            if start > cursor:
                missing.append((cursor, min(start - 1, requested_end)))
            cursor = max(cursor, end + 1)
            if cursor > requested_end:
                break
        if cursor <= requested_end:
            missing.append((cursor, requested_end))
        return missing

    def _reconcile(self, dataset_id: str) -> None:
        merged: list[tuple[int, int]] = []
        for start, end in self.intervals(dataset_id):
            if merged and start <= merged[-1][1] + self.ADJACENCY_TOLERANCE_S:
                merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
            else:
                merged.append((start, end))
        self._conn.execute("DELETE FROM coverage WHERE dataset_id = ?", (dataset_id,))
        self._conn.executemany(
            "INSERT INTO coverage (dataset_id, start_timestamp, end_timestamp, provider) "
            "VALUES (?, ?, ?, '')",
            [(dataset_id, s, e) for s, e in merged],
        )
        self._conn.commit()


class SymbolRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def upsert(
        self,
        symbol: str,
        asset_class: str,
        display_name: str | None = None,
        exchange: str | None = None,
        timezone: str = "UTC",
        providers: list[str] | None = None,
        favorite: bool = False,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO symbols (symbol, display_name, asset_class, exchange, timezone, providers, favorite, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
              display_name = excluded.display_name,
              asset_class = excluded.asset_class,
              exchange = excluded.exchange,
              timezone = excluded.timezone,
              providers = excluded.providers,
              favorite = excluded.favorite
            """,
            (
                symbol,
                display_name,
                asset_class,
                exchange,
                timezone,
                json.dumps(providers or []),
                int(favorite),
                now_iso(),
            ),
        )
        self._conn.commit()

    def search(self, query: str, limit: int = 20) -> list[sqlite3.Row]:
        q = f"%{query.strip()}%"
        return self._conn.execute(
            "SELECT * FROM symbols WHERE symbol LIKE ? OR display_name LIKE ? "
            "OR exchange LIKE ? OR asset_class LIKE ? ORDER BY favorite DESC, symbol LIMIT ?",
            (q, q, q, q, limit),
        ).fetchall()

    def get(self, symbol: str) -> sqlite3.Row | None:
        return self._conn.execute("SELECT * FROM symbols WHERE symbol = ?", (symbol,)).fetchone()

    def set_favorite(self, symbol: str, favorite: bool) -> None:
        self._conn.execute(
            "UPDATE symbols SET favorite = ? WHERE symbol = ?", (int(favorite), symbol.upper())
        )
        self._conn.commit()

    def list_favorites(self) -> list[sqlite3.Row]:
        return self._conn.execute(
            "SELECT * FROM symbols WHERE favorite = 1 ORDER BY symbol"
        ).fetchall()

    def all(self) -> list[sqlite3.Row]:
        return self._conn.execute("SELECT * FROM symbols ORDER BY symbol").fetchall()
