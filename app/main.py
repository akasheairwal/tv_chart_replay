"""Application entry point.

Launches the PySide6 desktop shell, wires the QWebChannel bridge, and
loads the TypeScript frontend (Vite dev server or the built bundle).
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# Ensure workspace root is in sys.path when invoked directly via python app/main.py
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from PySide6.QtCore import QUrl
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QMainWindow

from app.application import build_context
from app.bridge.channel import setup_bridge
from app.bridge.commands import BridgeCommandHandler
from app.config.paths import get_paths
from app.config.settings import AppSettings, get_settings

logger = logging.getLogger(__name__)


def configure_logging(settings: AppSettings) -> None:
    paths = get_paths().ensure()
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    log_file = paths.logs_dir / "app.log"
    try:
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
    except OSError as exc:  # pragma: no cover - log dir unavailable
        logger.warning("Could not open log file %s: %s", log_file, exc)
    logging.basicConfig(
        level=logging.getLevelName(settings.log_level.upper()),
        format=settings.log_format,
        handlers=handlers,
    )


class MainWindow(QMainWindow):
    """Desktop shell: web view + bridge + status bar wiring."""

    def __init__(
        self,
        settings: AppSettings,
        dev_mode: bool = False,
        parent=None,
    ) -> None:
        super().__init__(parent)
        self.settings = settings
        self.dev_mode = dev_mode

        self.setWindowTitle(f"{settings.app_name} {settings.app_version}")
        self.resize(settings.window_width, settings.window_height)

        self.web_view = QWebEngineView(self)
        self.setCentralWidget(self.web_view)

        self.bridge_channel, self.bridge_handler = setup_bridge(
            self.web_view.page(), app_version=settings.app_version
        )

        # Wave-1 data services: registry/store/provider/manager + event relay.
        self.context = build_context(settings)
        self.bridge_handler.attach_services(self.context)
        self.context.event_relay.eventEmitted.connect(self.bridge_handler.eventEmitted)

        self.web_view.load(self._resolve_start_url())

    def closeEvent(self, event) -> None:
        self.context.close()
        super().closeEvent(event)

    def _resolve_start_url(self) -> QUrl:
        if self.dev_mode:
            return QUrl(self.settings.dev_server_url)
        dist_index = get_paths().frontend_dist / "index.html"
        if dist_index.exists():
            return QUrl.fromLocalFile(str(dist_index))
        logger.error(
            "Frontend bundle not found at %s - run `npm run build` or launch with --dev.",
            dist_index,
        )
        return QUrl(self.settings.dev_server_url)

    @property
    def handler(self) -> BridgeCommandHandler:
        return self.bridge_handler


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="trading-chart-replayer")
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Load frontend from the Vite dev server (run `npm run dev` first).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    settings = get_settings()
    configure_logging(settings)

    # Pass only the program name so Qt never sees our own CLI flags.
    app = QApplication(sys.argv[:1])
    args = parse_args(argv)

    window = MainWindow(settings, dev_mode=args.dev)
    window.show()
    logger.info("app.started dev_mode=%s", args.dev)
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
