"""Unit tests for SessionManager and SQLite session persistence."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.data.registry.dataset_registry import DatasetRegistry
from app.database.connection import connect
from app.sessions.manager import SessionManager
from app.sessions.models import IndicatorSnapshot, ReplaySnapshot, SessionDefinition


@pytest.fixture
def session_manager(tmp_path: Path) -> SessionManager:
    conn = connect(tmp_path / "test.db")
    dataset_registry = DatasetRegistry(conn)
    return SessionManager(
        conn=conn,
        sessions_dir=tmp_path / "sessions",
        dataset_registry=dataset_registry,
    )


def test_session_save_and_load(session_manager: SessionManager) -> None:
    session = SessionDefinition(
        id="sess_test_1",
        name="EURUSD Breakout Study",
        symbol="EURUSD",
        timeframe="1H",
        dataset_id="ds_eurusd_1h_v1",
        dataset_version="v1.0",
        replay_state=ReplaySnapshot(start_index=10, current_index=55, end_index=100, speed=2.0),
        indicators=[
            IndicatorSnapshot(id="sma_1", name="SMA", params={"period": 20}, style={"color": "#2962ff"}),
            IndicatorSnapshot(id="rsi_1", name="RSI", params={"period": 14}, style={"color": "#ff9800"}),
        ],
        drawings=[
            {
                "id": "dw_1",
                "symbol": "EURUSD",
                "timeframe": "1H",
                "type": "trend_line",
                "points": [{"timestamp": 1700000000, "price": 1.0850}, {"timestamp": 1700003600, "price": 1.0900}],
                "style": {"color": "#2962ff", "width": 2},
                "locked": False,
                "visible": True,
            }
        ],
    )

    saved_id = session_manager.save_session(session)
    assert saved_id == "sess_test_1"

    loaded = session_manager.load_session("sess_test_1")
    assert loaded is not None
    assert loaded.id == "sess_test_1"
    assert loaded.name == "EURUSD Breakout Study"
    assert loaded.symbol == "EURUSD"
    assert loaded.timeframe == "1H"
    assert loaded.replay_state.current_index == 55
    assert loaded.replay_state.speed == 2.0
    assert len(loaded.indicators) == 2
    assert loaded.indicators[0].name == "SMA"
    assert len(loaded.drawings) == 1
    assert loaded.drawings[0]["type"] == "trend_line"


def test_session_listing_and_deletion(session_manager: SessionManager) -> None:
    s1 = SessionDefinition(id="s1", name="Study 1", symbol="EURUSD", timeframe="1H")
    s2 = SessionDefinition(id="s2", name="Study 2", symbol="BTCUSDT", timeframe="15m")

    session_manager.save_session(s1)
    session_manager.save_session(s2)

    summaries = session_manager.list_sessions()
    assert len(summaries) == 2
    assert {s.id for s in summaries} == {"s1", "s2"}

    assert session_manager.delete_session("s1") is True
    assert session_manager.load_session("s1") is None
    assert len(session_manager.list_sessions()) == 1


def test_autosave_lifecycle(session_manager: SessionManager) -> None:
    session = SessionDefinition(
        id="temp_sess",
        name="Active Work",
        symbol="XAUUSD",
        timeframe="5m",
        replay_state=ReplaySnapshot(current_index=42),
    )

    autosave_id = session_manager.save_autosave(session)
    assert autosave_id == "autosave_latest"

    # Regular list should not include autosave
    regular_list = session_manager.list_sessions(include_autosave=False)
    assert len(regular_list) == 0

    latest = session_manager.get_latest_autosave()
    assert latest is not None
    assert latest.symbol == "XAUUSD"
    assert latest.replay_state.current_index == 42
    assert latest.is_autosave is True


def test_dataset_versioning_mismatch_check(session_manager: SessionManager) -> None:
    # 1. Dataset missing
    session = SessionDefinition(
        id="s_ver",
        name="Version Check",
        symbol="EURUSD",
        timeframe="1H",
        dataset_version="ds_v1",
    )
    check = session_manager.check_dataset_version_match(session)
    assert check["match"] is False
    assert check["status"] == "missing"

    # 2. Register dataset with matching version
    session_manager._dataset_registry.upsert_with_data(
        dataset_id="ds_v1",
        symbol="EURUSD",
        asset_class="forex",
        exchange="OANDA",
        provider="yahoo",
        timeframe="1H",
        start_timestamp=1000,
        end_timestamp=2000,
        row_count=500,
        file_path="/tmp/ds_v1.parquet",
        file_size=1024,
        checksum="chk123",
    )

    check_match = session_manager.check_dataset_version_match(session)
    assert check_match["match"] is True
    assert check_match["status"] == "ready"

    # 3. Version drift
    session.dataset_version = "ds_old_v0"
    check_drift = session_manager.check_dataset_version_match(session)
    assert check_drift["match"] is False
    assert check_drift["status"] == "mismatch"
