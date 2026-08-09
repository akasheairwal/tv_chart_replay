"""Explicit bridge command surface (whitelist).

Only ``@Slot``-decorated methods are invokable from TypeScript, which is
the security boundary required by the architecture (``#61``/``#77``): no
``eval``, no arbitrary method exposure, no arbitrary filesystem access.
"""

from __future__ import annotations

import logging
from typing import Any

from PySide6.QtCore import QObject, Signal, Slot

from app.bridge.events import serialize_payload

logger = logging.getLogger(__name__)


class BridgeCommandHandler(QObject):
    """The single QWebChannel object registered as ``bridge``.

    Exposed names use ``camelCase`` to match the TypeScript bridge
    contract (e.g. ``searchSymbols``, ``requestDataset``).
    """

    eventEmitted = Signal(str, str)  # (event_name, json_payload)

    def __init__(self, app_version: str = "") -> None:
        super().__init__()
        self._app_version = app_version
        self.ping_count = 0
        self._last_ping_message: str | None = None

    # -- system -----------------------------------------------------

    @Slot(result=str)
    def systemVersion(self) -> str:  # camelCase: bridge contract name
        return self._app_version

    @Slot(str, result=str)
    def systemPing(self, message: str) -> str:  # camelCase: bridge contract name
        self.ping_count += 1
        self._last_ping_message = message
        logger.debug("bridge.ping message=%r", message)
        return f"pong:{message}"

    @Slot(str)
    def systemLog(self, message: str) -> None:  # camelCase: bridge contract name
        logger.info("js.log message=%s", message)

    # -- events (Python -> TypeScript) ------------------------------

    def emit(self, event: str, payload: dict[str, Any] | None = None) -> None:
        """Emit a structured event to the TypeScript side."""
        self.eventEmitted.emit(event, serialize_payload(payload))

    # -- introspection (tests) --------------------------------------

    @property
    def last_ping_message(self) -> str | None:
        return self._last_ping_message
