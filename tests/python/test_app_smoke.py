"""Launch the real app shell against the built frontend bundle.

Exercises the full stack: PySide6 window -> QWebEngineView -> built
TypeScript bundle -> QWebChannel bridge -> Python ping round trip.
"""

from __future__ import annotations

import pytest

from app.config.paths import get_paths


def _bundle_is_built() -> bool:
    return get_paths().frontend_dist.joinpath("index.html").is_file()


@pytest.mark.integration
@pytest.mark.skipif(
    not _bundle_is_built(), reason="frontend bundle missing - run `npm run build` first"
)
def test_main_window_full_round_trip(session_app, wait_until) -> None:
    from app.config.settings import get_settings
    from app.main import MainWindow

    window = MainWindow(get_settings(), dev_mode=False)
    loaded: list[bool] = []
    window.web_view.loadFinished.connect(loaded.append)
    window.show()

    try:
        assert wait_until(lambda: bool(loaded)), "app page never finished loading"
        assert loaded[-1], "app page failed to load"
        assert wait_until(lambda: window.bridge_handler.ping_count >= 1), (
            "frontend bundle never pinged Python over the bridge"
        )
        assert window.bridge_handler.last_ping_message == "hello from app"
    finally:
        window.close()
