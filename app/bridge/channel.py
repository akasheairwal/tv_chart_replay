"""QWebChannel wiring between the embedded WebView and Python core."""

from __future__ import annotations

from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEnginePage

from app.bridge.commands import BridgeCommandHandler
from app.config.defaults import BRIDGE_OBJECT_NAME


def setup_bridge(
    page: QWebEnginePage, app_version: str = ""
) -> tuple[QWebChannel, BridgeCommandHandler]:
    """Attach the bridge to ``page`` and register the command handler.

    Returns ``(channel, handler)`` so callers can keep a reference to the
    handler (events, tests), which QWebChannel's lifetime also requires.
    """
    handler = BridgeCommandHandler(app_version=app_version)
    channel = QWebChannel(page)
    page.setWebChannel(channel)
    channel.registerObject(BRIDGE_OBJECT_NAME, handler)
    return channel, handler
