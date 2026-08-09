"""Configuration and paths unit tests (no Qt required)."""

from __future__ import annotations

from app.config.defaults import DEFAULT_TIMEFRAMES, SUPPORTED_REPLAY_SPEEDS
from app.config.paths import get_paths
from app.config.settings import AppSettings


def test_settings_defaults() -> None:
    settings = AppSettings()
    assert settings.app_version == "0.1.0"
    assert settings.window_width > 0
    assert settings.window_height > 0
    assert settings.dev_server_url.startswith("http://")


def test_paths_layout() -> None:
    paths = get_paths()
    assert paths.project_root.is_dir()
    assert paths.frontend_dir.is_dir()
    assert paths.normalized_dir == paths.data_dir / "normalized"
    assert paths.database_path.suffix == ".db"


def test_paths_ensure_creates_runtime_dirs() -> None:
    paths = get_paths().ensure()
    assert paths.logs_dir.is_dir()
    assert paths.raw_dir.is_dir()
    assert paths.sessions_dir.is_dir()


def test_timeframes_and_speeds() -> None:
    assert "1m" in DEFAULT_TIMEFRAMES
    assert "1H" in DEFAULT_TIMEFRAMES
    assert "1M" in DEFAULT_TIMEFRAMES
    assert 1.0 in SUPPORTED_REPLAY_SPEEDS
    assert 100.0 in SUPPORTED_REPLAY_SPEEDS
