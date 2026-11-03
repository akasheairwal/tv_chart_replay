"""Qt timer-driven replay clock (architecture ``#36``)."""
from __future__ import annotations

from collections.abc import Callable

from app.compat import QObject, QTimer


class ReplayClock(QObject):
    """Controls the pacing of replay ticks based on configured playback speed."""

    def __init__(
        self,
        on_tick: Callable[[int], None],
        *,
        base_interval_ms: int = 1000,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._on_tick = on_tick
        self._base_interval_ms = base_interval_ms
        self._speed = 1.0
        self._batch_size = 1

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._handle_timeout)

    @property
    def is_running(self) -> bool:
        return self._timer.isActive()

    @property
    def speed(self) -> float:
        return self._speed

    def set_speed(self, speed: float) -> None:
        if speed <= 0:
            raise ValueError(f"Speed must be positive, got {speed}")
        self._speed = float(speed)

        # High-speed batching at 60 FPS minimum interval (16ms)
        raw_interval = self._base_interval_ms / self._speed
        if raw_interval < 16.0:
            self._timer_interval_ms = 16
            self._batch_size = max(1, int(self._speed / 50.0))
        else:
            self._timer_interval_ms = int(raw_interval)
            self._batch_size = 1

        if self.is_running:
            self._timer.setInterval(self._timer_interval_ms)

    def start(self) -> None:
        self.set_speed(self._speed)
        self._timer.start(self._timer_interval_ms)

    def stop(self) -> None:
        self._timer.stop()

    def _handle_timeout(self) -> None:
        self._on_tick(self._batch_size)
