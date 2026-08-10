"""Integration tests for bridge session slots (saveSession, loadSession, etc.)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.application import build_context
from app.bridge.commands import BridgeCommandHandler
from app.config.paths import Paths
from app.config.settings import AppSettings


@pytest.fixture
def bridge_handler(tmp_path: Path) -> BridgeCommandHandler:
    paths = Paths.create(root=tmp_path).ensure()
    ctx = build_context(AppSettings(dev_mode=True), paths=paths)
    handler = BridgeCommandHandler(app_version="0.1.0")
    handler.attach_services(ctx)
    return handler


def test_bridge_session_roundtrip(bridge_handler: BridgeCommandHandler) -> None:
    session_data = {
        "id": "sess_bridge_1",
        "name": "Bridge Test Session",
        "symbol": "EURUSD",
        "timeframe": "1H",
        "replay_state": {"current_index": 77, "speed": 3.0},
        "indicators": [{"id": "ema_1", "name": "EMA", "params": {"period": 50}}],
        "drawings": [
            {
                "id": "dw_b1",
                "symbol": "EURUSD",
                "timeframe": "1H",
                "type": "rectangle",
                "points": [{"timestamp": 100, "price": 1.0}, {"timestamp": 200, "price": 1.1}],
                "style": {"color": "#ff9800"},
            }
        ],
    }

    # Save
    save_resp = json.loads(bridge_handler.saveSession(json.dumps(session_data)))
    assert save_resp["ok"] is True
    assert save_resp["data"]["id"] == "sess_bridge_1"

    # List
    list_resp = json.loads(bridge_handler.listSessions())
    assert list_resp["ok"] is True
    assert len(list_resp["data"]) == 1
    assert list_resp["data"][0]["name"] == "Bridge Test Session"
    assert list_resp["data"][0]["drawing_count"] == 1
    assert list_resp["data"][0]["indicator_count"] == 1

    # Load
    load_resp = json.loads(bridge_handler.loadSession('"sess_bridge_1"'))
    assert load_resp["ok"] is True
    assert load_resp["data"]["name"] == "Bridge Test Session"
    assert load_resp["data"]["replay_state"]["current_index"] == 77
    assert len(load_resp["data"]["drawings"]) == 1

    # Delete
    del_resp = json.loads(bridge_handler.deleteSession('"sess_bridge_1"'))
    assert del_resp["ok"] is True
    assert del_resp["data"]["deleted"] is True

    # List after delete
    list_resp2 = json.loads(bridge_handler.listSessions())
    assert len(list_resp2["data"]) == 0
