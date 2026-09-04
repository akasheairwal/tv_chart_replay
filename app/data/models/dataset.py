"""Dataset metadata model (architecture ``#23``)."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from app.data.models.timeframe import Timeframe


class DatasetStatus(str, Enum):
    MISSING = "MISSING"
    QUEUED = "QUEUED"
    DOWNLOADING = "DOWNLOADING"
    PROCESSING = "PROCESSING"
    VALIDATING = "VALIDATING"
    SAVING = "SAVING"
    READY = "READY"
    STALE = "STALE"
    INVALID = "INVALID"
    FAILED = "FAILED"


def dataset_id_for(symbol: str, timeframe: Timeframe | str) -> str:
    """Stable dataset identifier, e.g. ``EURUSD-1H``."""
    tf = timeframe.freq if isinstance(timeframe, Timeframe) else Timeframe.parse(timeframe).freq
    return f"{symbol.upper()}-{tf}"


@dataclass(frozen=True)
class DatasetInfo:
    """Public dataset metadata returned over the bridge."""

    dataset_id: str
    symbol: str
    timeframe: str
    asset_class: str
    provider: str = ""
    exchange: str | None = None
    start_timestamp: int | None = None
    end_timestamp: int | None = None
    row_count: int = 0
    file_path: str | None = None
    file_size: int | None = None
    checksum: str | None = None
    timezone: str = "UTC"
    schema_version: str = "1.0"
    dataset_version: int = 1
    status: str = DatasetStatus.MISSING.value
    created_at: str = ""
    updated_at: str = ""
    coverage: list[list[int]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "dataset_id": self.dataset_id,
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "asset_class": self.asset_class,
            "provider": self.provider,
            "exchange": self.exchange,
            "start": self.start_timestamp,
            "end": self.end_timestamp,
            "row_count": self.row_count,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "checksum": self.checksum,
            "timezone": self.timezone,
            "schema_version": self.schema_version,
            "dataset_version": self.dataset_version,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "coverage": self.coverage,
        }