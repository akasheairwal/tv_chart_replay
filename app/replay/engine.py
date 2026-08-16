"""Core Replay Engine (architecture ``#31``/``#33``/``#35``/``#80``)."""
from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

import polars as pl
from PySide6.QtCore import QObject

from app.data.models.symbol import Symbol
from app.data.models.timeframe import Timeframe
from app.replay.clock import ReplayClock
from app.replay.isolation import IsolatedDataset
from app.replay.random_start import select_random_replay_window
from app.replay.state import ReplayState, ReplayStatus

logger = logging.getLogger(__name__)

EventEmitter = Callable[[str, dict[str, Any]], None]


class ReplayEngine(QObject):
    """Replay engine driving playback, future data blocking, and bridge events."""

    def __init__(
        self,
        emit: EventEmitter | None = None,
        on_tick: Callable[[str, float, float, float, float, float], None] | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._emit = emit or (lambda name, payload: None)
        self.on_tick = on_tick
        self._dataset: IsolatedDataset | None = None
        self._state: ReplayState | None = None
        self._clock = ReplayClock(self._on_clock_tick, parent=self)

    @property
    def state(self) -> ReplayState | None:
        return self._state

    @property
    def is_active(self) -> bool:
        return self._state is not None

    # -- session setup -----------------------------------------------

    def create_replay(
        self,
        symbol: Symbol | str,
        timeframe: Timeframe | str,
        frame: pl.DataFrame,
        *,
        start_index: int | None = None,
        start_s: int | None = None,
        end_s: int | None = None,
        warmup_candles: int = 100,
        speed: float = 1.0,
    ) -> ReplayState:
        """Initialize a new replay session over ``frame``."""
        self._clock.stop()
        self._dataset = IsolatedDataset(frame)
        sym_str = getattr(symbol, "symbol", str(symbol))
        tf_str = getattr(timeframe, "freq", str(timeframe))

        total = self._dataset.total_candles

        if start_index is None:
            if start_s is not None:
                # Find index matching start_s
                ts_col = frame["timestamp"].to_list()
                start_index = 0
                for idx, t in enumerate(ts_col):
                    if t >= start_s:
                        start_index = idx
                        break
            else:
                start_index = min(warmup_candles, max(0, total - 1))

        start_index = max(0, min(start_index, total - 1))

        if end_s is not None:
            ts_col = frame["timestamp"].to_list()
            end_index = total - 1
            for idx, t in enumerate(ts_col):
                if t >= end_s:
                    end_index = idx
                    break
        else:
            end_index = total - 1

        end_index = max(start_index, min(end_index, total - 1))

        self._state = ReplayState(
            symbol=sym_str,
            timeframe=tf_str,
            status=ReplayStatus.PAUSED,
            current_index=start_index,
            start_index=start_index,
            end_index=end_index,
            warmup_candles=start_index,
            speed=speed,
            current_timestamp=self._dataset.timestamp_at(start_index),
            total_candles=total,
        )
        self._clock.set_speed(speed)

        payload = self._state.to_dict()
        self._emit("replay.created", payload)
        self._emit("replay.state", payload)
        return self._state

    def create_random_replay(
        self,
        symbol: Symbol | str,
        timeframe: Timeframe | str,
        frame: pl.DataFrame,
        *,
        warmup_candles: int = 250,
        replay_length: int = 500,
        speed: float = 1.0,
        seed: int | None = None,
    ) -> ReplayState:
        """Initialize a random replay session with safe warmup and bounds."""
        dataset = IsolatedDataset(frame)
        start_idx, _, effective_warmup = select_random_replay_window(
            dataset.total_candles,
            warmup_candles=warmup_candles,
            replay_length=replay_length,
            seed=seed,
        )
        return self.create_replay(
            symbol=symbol,
            timeframe=timeframe,
            frame=frame,
            start_index=start_idx,
            warmup_candles=effective_warmup,
            speed=speed,
        )

    # -- playback controls -------------------------------------------

    def play(self) -> ReplayState:
        self._require_active()
        assert self._state is not None

        if self._state.is_finished:
            self.reset()

        self._state.status = ReplayStatus.PLAYING
        self._clock.start()
        payload = self._state.to_dict()
        self._emit("replay.started", payload)
        self._emit("replay.state", payload)
        return self._state

    def pause(self) -> ReplayState | None:
        self._clock.stop()
        if self._state is None:
            return None

        self._state.status = ReplayStatus.PAUSED
        payload = self._state.to_dict()
        self._emit("replay.paused", payload)
        self._emit("replay.state", payload)
        return self._state

    def step_forward(self, step: int = 1) -> tuple[ReplayState, list[list[Any]]]:
        """Advance by ``step`` candles. Returns new state and newly revealed candles."""
        self._require_active()
        assert self._state is not None
        assert self._dataset is not None

        if self._state.current_index >= self._state.end_index:
            self._clock.stop()
            self._state.status = ReplayStatus.FINISHED
            payload = self._state.to_dict()
            self._emit("replay.finished", payload)
            self._emit("replay.state", payload)
            return self._state, []

        old_index = self._state.current_index
        new_index = min(self._state.end_index, old_index + max(1, step))
        self._state.current_index = new_index
        self._state.current_timestamp = self._dataset.timestamp_at(new_index)

        new_candles = [self._dataset.candle_at(i) for i in range(old_index + 1, new_index + 1)]

        for idx_offset, candle in enumerate(new_candles):
            candle_idx = old_index + 1 + idx_offset
            self._emit("replay.candle", {"candle": candle, "index": candle_idx})
            if self.on_tick and len(candle) >= 5 and self._state:
                try:
                    self.on_tick(
                        self._state.symbol,
                        float(candle[1]),
                        float(candle[2]),
                        float(candle[3]),
                        float(candle[4]),
                        float(candle[0]),
                    )
                except Exception:
                    logger.exception("on_tick callback failed")

        if new_index >= self._state.end_index:
            self._clock.stop()
            self._state.status = ReplayStatus.FINISHED
            self._emit("replay.finished", self._state.to_dict())

        payload = self._state.to_dict()
        self._emit("replay.state", payload)
        return self._state, new_candles

    def step_backward(self, step: int = 1) -> tuple[ReplayState, list[list[Any]]]:
        """Step back by ``step`` candles. Returns new state and full visible candles."""
        self._require_active()
        assert self._state is not None
        assert self._dataset is not None

        self.pause()
        new_index = max(0, self._state.current_index - max(1, step))
        self._state.current_index = new_index
        self._state.current_timestamp = self._dataset.timestamp_at(new_index)
        self._state.status = ReplayStatus.PAUSED

        visible = self._dataset.visible_rows(new_index)
        payload = self._state.to_dict()
        self._emit("replay.state", payload)
        return self._state, visible

    def jump_to(self, target_index_or_timestamp: int) -> tuple[ReplayState, list[list[Any]]]:
        """Jump to specific index or epoch timestamp."""
        self._require_active()
        assert self._state is not None
        assert self._dataset is not None

        self.pause()
        target = target_index_or_timestamp
        if target > 1_000_000_000:
            # Target is timestamp -> find closest index <= target
            closest_idx = 0
            for idx in range(self._dataset.total_candles):
                if self._dataset.timestamp_at(idx) <= target:
                    closest_idx = idx
                else:
                    break
            target_idx = closest_idx
        else:
            target_idx = max(0, min(target, self._dataset.total_candles - 1))

        self._state.current_index = target_idx
        self._state.current_timestamp = self._dataset.timestamp_at(target_idx)
        self._state.status = (
            ReplayStatus.FINISHED if target_idx >= self._state.end_index else ReplayStatus.PAUSED
        )

        visible = self._dataset.visible_rows(target_idx)
        payload = self._state.to_dict()
        self._emit("replay.state", payload)
        return self._state, visible

    def reset(self) -> tuple[ReplayState, list[list[Any]]]:
        """Reset replay to the initial ``start_index``."""
        self._require_active()
        assert self._state is not None
        assert self._dataset is not None

        self.pause()
        self._state.current_index = self._state.start_index
        self._state.current_timestamp = self._dataset.timestamp_at(self._state.start_index)
        self._state.status = ReplayStatus.PAUSED

        visible = self._dataset.visible_rows(self._state.start_index)
        payload = self._state.to_dict()
        self._emit("replay.state", payload)
        return self._state, visible

    def set_speed(self, speed: float) -> ReplayState:
        self._require_active()
        assert self._state is not None

        self._state.speed = float(speed)
        self._clock.set_speed(speed)
        payload = self._state.to_dict()
        self._emit("replay.state", payload)
        return self._state

    # -- data access (strictly replay-safe) ---------------------------

    def visible_candles(self) -> list[list[Any]]:
        self._require_active()
        assert self._state is not None
        assert self._dataset is not None
        return self._dataset.visible_rows(self._state.current_index)

    def current_candle(self) -> list[Any]:
        self._require_active()
        assert self._state is not None
        assert self._dataset is not None
        return self._dataset.candle_at(self._state.current_index)

    # -- internal helpers --------------------------------------------

    def _on_clock_tick(self, batch_size: int) -> None:
        if self._state and self._state.is_playing:
            self.step_forward(batch_size)

    def _require_active(self) -> None:
        if self._state is None or self._dataset is None:
            raise RuntimeError("No active replay session. Call create_replay() first.")
