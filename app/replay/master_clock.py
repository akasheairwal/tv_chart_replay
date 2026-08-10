"""
Master Replay Clock — synchronizes replay progression across multiple charts and timeframes (§68–69).
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


@dataclass
class SlaveChartState:
    chart_id: str
    symbol: str
    timeframe: str
    current_timestamp: int = 0
    current_index: int = 0


class MasterReplayClock:
    """Master replay clock that drives multiple chart viewports under one unified time progression."""

    def __init__(self):
        self.is_playing: bool = False
        self.master_timeframe: str = "1H"
        self.master_timestamp: int = 0
        self.slaves: dict[str, SlaveChartState] = {}
        self._on_tick: Callable[[int, dict[str, Any]], None] | None = None

    def register_chart(self, chart_id: str, symbol: str, timeframe: str) -> None:
        self.slaves[chart_id] = SlaveChartState(
            chart_id=chart_id,
            symbol=symbol,
            timeframe=timeframe,
        )

    def unregister_chart(self, chart_id: str) -> None:
        self.slaves.pop(chart_id, None)

    def sync_tick(self, master_timestamp: int, slave_updates: dict[str, int]) -> dict[str, Any]:
        """Broadcast tick to all synchronized slave charts."""
        self.master_timestamp = master_timestamp
        updates = {}
        for chart_id, state in self.slaves.items():
            if chart_id in slave_updates:
                state.current_timestamp = master_timestamp
                state.current_index = slave_updates[chart_id]
                updates[chart_id] = {
                    "timestamp": master_timestamp,
                    "index": state.current_index,
                }

        payload = {
            "master_timestamp": master_timestamp,
            "updates": updates,
        }
        if self._on_tick:
            self._on_tick(master_timestamp, payload)
        return payload
