"""Replay state and status models (architecture ``#31``/``#35``)."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class ReplayStatus(str, Enum):
    IDLE = "IDLE"
    PAUSED = "PAUSED"
    PLAYING = "PLAYING"
    FINISHED = "FINISHED"


@dataclass
class ReplayState:
    """Full snapshot of the replay engine state."""

    symbol: str
    timeframe: str
    status: ReplayStatus
    current_index: int
    start_index: int
    end_index: int
    warmup_candles: int
    speed: float
    current_timestamp: int
    total_candles: int

    @property
    def is_playing(self) -> bool:
        return self.status == ReplayStatus.PLAYING

    @property
    def is_finished(self) -> bool:
        return self.status == ReplayStatus.FINISHED

    @property
    def visible_count(self) -> int:
        return self.current_index + 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "status": self.status.value,
            "current_index": self.current_index,
            "start_index": self.start_index,
            "end_index": self.end_index,
            "warmup_candles": self.warmup_candles,
            "speed": self.speed,
            "current_timestamp": self.current_timestamp,
            "total_candles": self.total_candles,
            "visible_count": self.visible_count,
        }
