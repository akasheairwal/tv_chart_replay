"""Bridge replay commands and event round-trip tests."""
from __future__ import annotations

import json
from types import SimpleNamespace

from fakes import collect_events, make_frame

from app.bridge.commands import BridgeCommandHandler
from app.config.paths import Paths
from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import H1
from app.data.registry.dataset_registry import DatasetRegistry
from app.data.registry.symbol_registry import SymbolRegistry
from app.data.storage.dataset_store import DatasetStore
from app.database.connection import connect
from app.replay.engine import ReplayEngine


def _setup_services(tmp_path):
    conn = connect(tmp_path / "db.sqlite")
    symbol_registry = SymbolRegistry(conn)
    dataset_registry = DatasetRegistry(conn)
    paths = Paths.create(tmp_path)
    store = DatasetStore(paths, dataset_registry)
    events, emit = collect_events()
    replay_engine = ReplayEngine(emit=emit)

    # Save a test dataset
    symbol = Symbol("BTCUSDT", "Bitcoin", AssetClass.CRYPTO, "BINANCE")
    store.save_dataset(
        symbol=symbol,
        timeframe=H1,
        asset_class=AssetClass.CRYPTO,
        provider="fake",
        frame=make_frame(count=50),
    )

    services = SimpleNamespace(
        symbol_registry=symbol_registry,
        dataset_registry=dataset_registry,
        dataset_store=store,
        replay_engine=replay_engine,
    )

    handler = BridgeCommandHandler(app_version="0.1.0")
    handler.attach_services(services)
    return handler, replay_engine, events, conn


def test_bridge_replay_workflow(tmp_path):
    handler, engine, events, conn = _setup_services(tmp_path)

    # 1. createReplay
    req = json.dumps({"symbol": "BTCUSDT", "timeframe": "1H", "warmup_candles": 10, "speed": 2.0})
    res = json.loads(handler.createReplay(req))
    assert res["ok"] is True
    assert res["data"]["state"]["current_index"] == 10
    assert len(res["data"]["candles"]) == 11

    # 2. playReplay
    res_play = json.loads(handler.playReplay())
    assert res_play["ok"] is True
    assert res_play["data"]["status"] == "PLAYING"

    # 3. replayNext
    res_next = json.loads(handler.replayNext("2"))
    assert res_next["ok"] is True
    assert res_next["data"]["state"]["current_index"] == 12
    assert len(res_next["data"]["candles"]) == 2

    # 4. replayPrevious
    res_prev = json.loads(handler.replayPrevious("1"))
    assert res_prev["ok"] is True
    assert res_prev["data"]["state"]["current_index"] == 11

    # 5. setReplaySpeed
    res_speed = json.loads(handler.setReplaySpeed("5.0"))
    assert res_speed["ok"] is True
    assert res_speed["data"]["speed"] == 5.0

    # 6. pauseReplay
    res_pause = json.loads(handler.pauseReplay())
    assert res_pause["ok"] is True
    assert res_pause["data"]["status"] == "PAUSED"

    # 7. replayReset
    res_reset = json.loads(handler.replayReset())
    assert res_reset["ok"] is True
    assert res_reset["data"]["state"]["current_index"] == 10

    conn.close()
