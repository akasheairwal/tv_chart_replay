"""Canonical models for replay sessions and state snapshots (Architecture ``#53``/``#55``)."""
from __future__ import annotations

import dataclasses
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class ReplaySnapshot:
    """Snapshot of replay clock and visible index range."""

    start_index: int = 0
    current_index: int = 0
    end_index: int = 0
    speed: float = 1.0
    is_playing: bool = False


@dataclass
class IndicatorSnapshot:
    """Snapshot of an active indicator on the chart."""

    id: str
    name: str
    params: dict[str, Any] = field(default_factory=dict)
    style: dict[str, Any] = field(default_factory=dict)
    visible: bool = True


@dataclass
class SessionDefinition:
    """Complete replay session definition representing visual & calculation state."""

    id: str
    name: str
    symbol: str
    timeframe: str
    dataset_id: str | None = None
    dataset_version: str | None = None
    replay_state: ReplaySnapshot = field(default_factory=ReplaySnapshot)
    indicators: list[IndicatorSnapshot] = field(default_factory=list)
    drawings: list[dict[str, Any]] = field(default_factory=list)
    chart_settings: dict[str, Any] = field(default_factory=dict)
    created_at: int = field(default_factory=lambda: int(time.time()))
    updated_at: int = field(default_factory=lambda: int(time.time()))
    is_autosave: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SessionDefinition:
        replay_data = data.get("replay_state", {})
        replay_state = (
            ReplaySnapshot(**_filter_known_fields(ReplaySnapshot, replay_data))
            if isinstance(replay_data, dict)
            else ReplaySnapshot()
        )

        indicators_raw = data.get("indicators", [])
        indicators = [
            IndicatorSnapshot(**_filter_known_fields(IndicatorSnapshot, ind))
            if isinstance(ind, dict)
            else ind
            for ind in indicators_raw
        ]

        return cls(
            id=str(data.get("id") or f"sess_{int(time.time())}_{uuid.uuid4().hex[:6]}"),
            name=str(data.get("name", "Untitled Session")),
            symbol=str(data.get("symbol", "")).upper(),
            timeframe=str(data.get("timeframe", "1H")),
            dataset_id=data.get("dataset_id"),
            dataset_version=data.get("dataset_version"),
            replay_state=replay_state,
            indicators=indicators,
            drawings=data.get("drawings", []),
            chart_settings=data.get("chart_settings", {}),
            created_at=int(data.get("created_at") or time.time()),
            updated_at=int(data.get("updated_at") or time.time()),
            is_autosave=bool(data.get("is_autosave", False)),
        )


@dataclass
class SessionSummary:
    """Summary item for session listing in UI."""

    id: str
    name: str
    symbol: str
    timeframe: str
    updated_at: int
    drawing_count: int
    indicator_count: int
    is_autosave: bool
    dataset_version: str | None = None


def _filter_known_fields(cls: type, data: dict[str, Any]) -> dict[str, Any]:
    """Keep only fields the dataclass knows; schema drift from older or
    newer saves must not crash deserialization."""
    known = {f.name for f in dataclasses.fields(cls)}
    return {k: v for k, v in data.items() if k in known}
