"""Shared pytest fixtures and Qt environment configuration.

The Qt platform and WebEngine flags are set *before* Qt is imported so the
offscreen platform is used consistently (headless/CI friendly).
"""

from __future__ import annotations

import os
import time
from collections.abc import Callable

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-gpu --no-sandbox")

import pytest
from PySide6.QtWidgets import QApplication


@pytest.fixture(scope="session")
def session_app() -> QApplication:
    app = QApplication.instance() or QApplication([])
    yield app


@pytest.fixture
def wait_until() -> Callable[[Callable[[], bool], float], bool]:
    """Pump the Qt event loop until `condition` or the timeout elapses."""

    def impl(condition: Callable[[], bool], timeout: float = 20.0, interval: float = 0.05) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            QApplication.processEvents()
            if condition():
                QApplication.processEvents()
                return True
            time.sleep(interval)
        QApplication.processEvents()
        return False

    return impl
