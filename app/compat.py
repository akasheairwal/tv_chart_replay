"""Qt Compatibility Layer for Headless Cloud Deployments.

When running on desktop, PySide6 provides the native Qt runtime.
When running in headless cloud environments (e.g. Render.com, Hugging Face, Linux containers)
where PySide6 is intentionally not installed, this module provides transparent, lightweight
pure-Python fallbacks for QObject, Signal, Slot, and QTimer.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

try:
    from PySide6.QtCore import QObject, QTimer, Signal, Slot

    IS_QT_AVAILABLE = True
except (ImportError, ModuleNotFoundError):
    IS_QT_AVAILABLE = False

    class QObject:
        """Lightweight pure-Python fallback for QObject."""

        def __init__(self, parent: Any | None = None) -> None:
            self._parent = parent

        def parent(self) -> Any | None:
            return self._parent

    class Signal:
        """Lightweight pure-Python fallback for Qt Signal."""

        def __init__(self, *types: Any, **kwargs: Any) -> None:
            self._types = types
            self._slots: list[Callable[..., Any]] = []

        def connect(self, slot: Callable[..., Any]) -> None:
            if slot not in self._slots:
                self._slots.append(slot)

        def disconnect(self, slot: Callable[..., Any]) -> None:
            if slot in self._slots:
                self._slots.remove(slot)

        def emit(self, *args: Any) -> None:
            for slot in list(self._slots):
                try:
                    slot(*args)
                except Exception as exc:
                    logger.warning("Error in headless Signal slot execution: %s", exc)

        def __get__(self, instance: Any, owner: Any) -> Signal:
            if instance is None:
                return self
            attr_name = f"_bound_signal_{id(self)}"
            if not hasattr(instance, attr_name):
                setattr(instance, attr_name, Signal(*self._types))
            return getattr(instance, attr_name)

    def Slot(*types: Any, **kwargs: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        """No-op decorator replacing PySide6 @Slot in headless environments."""

        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            return fn

        return decorator

    class QTimer(QObject):
        """Pure-Python threading.Timer-based fallback for QTimer."""

        def __init__(self, parent: QObject | None = None) -> None:
            super().__init__(parent)
            self.timeout = Signal()
            self._interval_ms: int = 1000
            self._active: bool = False
            self._timer: threading.Timer | None = None
            self._lock = threading.Lock()

        def setInterval(self, msec: int) -> None:
            with self._lock:
                self._interval_ms = max(1, int(msec))

        def start(self, msec: int | None = None) -> None:
            with self._lock:
                if msec is not None:
                    self._interval_ms = max(1, int(msec))
                self._active = True
                self._schedule()

        def stop(self) -> None:
            with self._lock:
                self._active = False
                if self._timer is not None:
                    self._timer.cancel()
                    self._timer = None

        def isActive(self) -> bool:
            with self._lock:
                return self._active

        def _schedule(self) -> None:
            if not self._active:
                return
            if self._timer is not None:
                self._timer.cancel()
            self._timer = threading.Timer(self._interval_ms / 1000.0, self._handle_timeout)
            self._timer.daemon = True
            self._timer.start()

        def _handle_timeout(self) -> None:
            with self._lock:
                if not self._active:
                    return
            try:
                self.timeout.emit()
            finally:
                with self._lock:
                    if self._active:
                        self._schedule()

