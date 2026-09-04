"""SQLite dataset registry + coverage bookkeeping (architecture ``#23``)."""
from __future__ import annotations

import sqlite3
import threading

from app.data.models.candle import SCHEMA_VERSION
from app.data.models.dataset import DatasetInfo, DatasetStatus
from app.database.repositories import (
    CoverageRepository,
    DatasetRepository,
    StoredDataset,
    now_iso,
)


class DatasetRegistry:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._datasets = DatasetRepository(conn)
        self._coverage = CoverageRepository(conn)
        self._lock = threading.RLock()

    # -- records -----------------------------------------------------

    def get(self, symbol: str, timeframe: str) -> StoredDataset | None:
        with self._lock:
            return self._datasets.get_by_symbol_timeframe(symbol, timeframe)

    def upsert_missing(
        self,
        *,
        dataset_id: str,
        symbol: str,
        asset_class: str,
        timeframe: str,
        exchange: str | None = None,
        timezone: str = "UTC",
    ) -> StoredDataset:
        with self._lock:
            existing = self._datasets.get(dataset_id)
            if existing is not None:
                return existing
            now = now_iso()
            row = StoredDataset(
                dataset_id=dataset_id,
                symbol=symbol,
                asset_class=asset_class,
                exchange=exchange,
                timeframe=timeframe,
                timezone=timezone,
                schema_version=SCHEMA_VERSION,
                status=DatasetStatus.MISSING.value,
                created_at=now,
                updated_at=now,
            )
            self._datasets.upsert(row)
            return row

    def upsert_with_data(
        self,
        *,
        dataset_id: str,
        symbol: str,
        asset_class: str,
        exchange: str | None,
        provider: str,
        timeframe: str,
        start_timestamp: int,
        end_timestamp: int,
        row_count: int,
        file_path: str,
        file_size: int,
        checksum: str,
        timezone: str = "UTC",
    ) -> StoredDataset:
        with self._lock:
            now = now_iso()
            existing = self._datasets.get(dataset_id)
            if existing is None or existing.checksum is None or existing.status == DatasetStatus.MISSING.value:
                version = 1
            elif existing.checksum != checksum:
                version = existing.dataset_version + 1  # dataset replaced -> version bump (#55)
            else:
                version = existing.dataset_version
            row = StoredDataset(
                dataset_id=dataset_id,
                symbol=symbol,
                asset_class=asset_class,
                exchange=exchange,
                provider=provider,
                timeframe=timeframe,
                start_timestamp=int(start_timestamp),
                end_timestamp=int(end_timestamp),
                row_count=int(row_count),
                file_path=file_path,
                file_size=int(file_size),
                checksum=checksum,
                timezone=timezone,
                schema_version=SCHEMA_VERSION,
                dataset_version=version,
                status=DatasetStatus.READY.value,
                created_at=(existing.created_at if existing else now),
                updated_at=now,
            )
            self._datasets.upsert(row)
            return row

    def set_status(self, dataset_id: str, status: str) -> None:
        with self._lock:
            self._datasets.set_status(dataset_id, status)

    def delete(self, dataset_id: str) -> None:
        with self._lock:
            self._datasets.delete(dataset_id)
            self._coverage.delete_dataset(dataset_id)

    def list_all(self) -> list[StoredDataset]:
        with self._lock:
            return self._datasets.list_all()

    # -- coverage -----------------------------------------------------

    def add_coverage(self, dataset_id: str, start: int, end: int, provider: str) -> None:
        with self._lock:
            self._coverage.add(dataset_id, int(start), int(end), provider)

    def intervals(self, dataset_id: str) -> list[tuple[int, int]]:
        with self._lock:
            return self._coverage.intervals(dataset_id)

    def missing_intervals(
        self, dataset_id: str, requested_start: int, requested_end: int
    ) -> list[tuple[int, int]]:
        with self._lock:
            return self._coverage.missing(dataset_id, int(requested_start), int(requested_end))

    # -- public info --------------------------------------------------

    def info(self, symbol: str, timeframe: str) -> DatasetInfo | None:
        with self._lock:
            stored = self.get(symbol, timeframe)
            if stored is None:
                return None
            return self._to_info(stored, self.intervals(stored.dataset_id))

    @staticmethod
    def _to_info(stored: StoredDataset, coverage: list[tuple[int, int]]) -> DatasetInfo:
        return DatasetInfo(
            dataset_id=stored.dataset_id,
            symbol=stored.symbol,
            timeframe=stored.timeframe,
            asset_class=stored.asset_class,
            provider=stored.provider,
            exchange=stored.exchange,
            start_timestamp=stored.start_timestamp,
            end_timestamp=stored.end_timestamp,
            row_count=stored.row_count,
            file_path=stored.file_path,
            file_size=stored.file_size,
            checksum=stored.checksum,
            timezone=stored.timezone,
            schema_version=stored.schema_version,
            dataset_version=stored.dataset_version,
            status=stored.status,
            created_at=stored.created_at,
            updated_at=stored.updated_at,
            coverage=[[s, e] for s, e in coverage],
        )