"""Download job model + state machine (architecture ``#16``)."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class DownloadJobState(str, Enum):
    CREATED = "CREATED"
    QUEUED = "QUEUED"
    STARTING = "STARTING"
    DOWNLOADING = "DOWNLOADING"
    PROCESSING = "PROCESSING"
    VALIDATING = "VALIDATING"
    SAVING = "SAVING"
    COMPLETED = "COMPLETED"
    RETRYING = "RETRYING"
    FAILED = "FAILED"


#: Legal transitions per architecture ``#16``.
_TRANSITIONS: dict[DownloadJobState, set[DownloadJobState]] = {
    DownloadJobState.CREATED: {
        DownloadJobState.QUEUED,
        DownloadJobState.STARTING,
        DownloadJobState.DOWNLOADING,
        DownloadJobState.RETRYING,
        DownloadJobState.PROCESSING,
        DownloadJobState.VALIDATING,
        DownloadJobState.SAVING,
        DownloadJobState.COMPLETED,
        DownloadJobState.FAILED,
    },
    DownloadJobState.QUEUED: {
        DownloadJobState.STARTING,
        DownloadJobState.DOWNLOADING,
        DownloadJobState.RETRYING,
        DownloadJobState.PROCESSING,
        DownloadJobState.VALIDATING,
        DownloadJobState.SAVING,
        DownloadJobState.COMPLETED,
        DownloadJobState.FAILED,
    },
    DownloadJobState.STARTING: {
        DownloadJobState.DOWNLOADING,
        DownloadJobState.RETRYING,
        DownloadJobState.PROCESSING,
        DownloadJobState.VALIDATING,
        DownloadJobState.SAVING,
        DownloadJobState.COMPLETED,
        DownloadJobState.FAILED,
    },
    DownloadJobState.DOWNLOADING: {
        DownloadJobState.RETRYING,
        DownloadJobState.PROCESSING,
        DownloadJobState.VALIDATING,
        DownloadJobState.SAVING,
        DownloadJobState.COMPLETED,
        DownloadJobState.FAILED,
    },
    DownloadJobState.RETRYING: {
        DownloadJobState.RETRYING,
        DownloadJobState.DOWNLOADING,
        DownloadJobState.STARTING,
        DownloadJobState.PROCESSING,
        DownloadJobState.VALIDATING,
        DownloadJobState.SAVING,
        DownloadJobState.COMPLETED,
        DownloadJobState.FAILED,
    },
    DownloadJobState.PROCESSING: {
        DownloadJobState.VALIDATING,
        DownloadJobState.SAVING,
        DownloadJobState.COMPLETED,
        DownloadJobState.FAILED,
    },
    DownloadJobState.VALIDATING: {
        DownloadJobState.SAVING,
        DownloadJobState.COMPLETED,
        DownloadJobState.FAILED,
    },
    DownloadJobState.SAVING: {
        DownloadJobState.COMPLETED,
        DownloadJobState.FAILED,
    },
    DownloadJobState.COMPLETED: set(),
    DownloadJobState.FAILED: {
        DownloadJobState.QUEUED,
        DownloadJobState.STARTING,
        DownloadJobState.DOWNLOADING,
        DownloadJobState.RETRYING,
    },
}


def validate_transition(current: DownloadJobState, target: DownloadJobState) -> None:
    if target not in _TRANSITIONS.get(current, set()):
        raise ValueError(f"Illegal job transition {current.value} -> {target.value}")


@dataclass
class DownloadJob:
    job_id: str
    symbol: str
    timeframe: str
    asset_class: str
    start: int
    end: int
    state: DownloadJobState = DownloadJobState.CREATED
    provider: str | None = None
    attempts: int = 0
    rows_downloaded: int = 0
    error: str | None = None
    events: list[str] = field(default_factory=list)

    def transition(self, target: DownloadJobState) -> None:
        validate_transition(self.state, target)
        self.state = target

    def as_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "asset_class": self.asset_class,
            "start": self.start,
            "end": self.end,
            "state": self.state.value,
            "provider": self.provider,
            "attempts": self.attempts,
            "rows_downloaded": self.rows_downloaded,
            "error": self.error,
        }