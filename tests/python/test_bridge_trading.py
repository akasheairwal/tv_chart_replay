"""
Integration tests for Trade Simulation bridge slots (Wave 9).
"""

import json
import os
import tempfile
from pathlib import Path

import pytest

from app.application import build_context
from app.bridge.commands import BridgeCommandHandler
from app.config.paths import Paths


@pytest.fixture
def temp_env():
    temp_dir = tempfile.mkdtemp()
    paths = Paths.create(root=Path(temp_dir)).ensure()
    yield paths
    try:
        if os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass


def test_bridge_trading_slots(temp_env):
    handler = BridgeCommandHandler("1.0.0")
    ctx = build_context(paths=temp_env)
    handler.attach_services(ctx)

    # 1. Place order
    payload = json.dumps({
        "symbol": "EURUSD",
        "side": "BUY",
        "order_type": "MARKET",
        "quantity": 100.0,
        "current_market_price": 1.1000,
    })
    res_str = handler.placeOrder(payload)
    res = json.loads(res_str)
    assert res["ok"] is True
    assert res["data"]["status"] == "FILLED"

    # 2. Get open positions
    pos_str = handler.getOpenPositions()
    pos_res = json.loads(pos_str)
    assert pos_res["ok"] is True
    assert len(pos_res["data"]) == 1
    pos_id = pos_res["data"][0]["position_id"]

    # 3. Close position
    close_str = handler.closePosition(pos_id, 1.1500, "MANUAL")
    close_res = json.loads(close_str)
    assert close_res["ok"] is True
    assert close_res["data"]["pnl"] > 0

    # 4. Get Trade Journal
    jrn_str = handler.getTradeJournal()
    jrn_res = json.loads(jrn_str)
    assert jrn_res["ok"] is True
    assert len(jrn_res["data"]) == 1

    ctx.close()
