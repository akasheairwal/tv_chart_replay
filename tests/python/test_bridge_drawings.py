"""Bridge drawing slots round-trip tests (Wave 5 & Wave 6)."""
import json
from types import SimpleNamespace

from fakes import collect_events

from app.bridge.commands import BridgeCommandHandler
from app.data.registry.drawing_registry import DrawingRegistry
from app.database.connection import connect


def test_bridge_drawing_slots(tmp_path):
    conn = connect(tmp_path / "db.sqlite")
    drawing_registry = DrawingRegistry(conn)
    events, emit = collect_events()

    services = SimpleNamespace(
        drawing_registry=drawing_registry,
    )

    handler = BridgeCommandHandler(app_version="0.1.0")
    handler.attach_services(services)

    # 1. saveDrawing basic
    d1 = {
        "id": "draw-bridge-1",
        "symbol": "BTCUSDT",
        "timeframe": "1H",
        "type": "trend_line",
        "points": [{"timestamp": 1700000000, "price": 45000.0}, {"timestamp": 1700010000, "price": 47000.0}],
        "style": {"color": "#2962ff", "width": 2},
        "locked": False,
        "visible": True,
    }
    res_save = json.loads(handler.saveDrawing(json.dumps(d1)))
    assert res_save["ok"] is True
    assert res_save["data"]["id"] == "draw-bridge-1"

    # 2. saveDrawing Wave 6 advanced (Fibonacci, Channels, Pitchfork, Measurement)
    d_fib = {
        "id": "draw-fib-1",
        "symbol": "BTCUSDT",
        "timeframe": "1H",
        "type": "fib_retracement",
        "points": [{"timestamp": 1700000000, "price": 40000.0}, {"timestamp": 1700010000, "price": 50000.0}],
        "style": {"color": "#ff9800", "width": 2, "levels": [0.0, 0.382, 0.5, 0.618, 1.0]},
        "locked": False,
        "visible": True,
    }
    d_pitchfork = {
        "id": "draw-pf-1",
        "symbol": "BTCUSDT",
        "timeframe": "1H",
        "type": "pitchfork",
        "points": [
            {"timestamp": 1700000000, "price": 42000.0},
            {"timestamp": 1700005000, "price": 48000.0},
            {"timestamp": 1700010000, "price": 44000.0},
        ],
        "style": {"color": "#089981", "width": 2},
        "locked": True,
        "visible": True,
    }
    handler.saveDrawing(json.dumps(d_fib))
    handler.saveDrawing(json.dumps(d_pitchfork))

    # 3. loadDrawings
    res_load = json.loads(handler.loadDrawings(json.dumps({"symbol": "BTCUSDT", "timeframe": "1H"})))
    assert res_load["ok"] is True
    assert len(res_load["data"]["drawings"]) == 3
    ids = {d["id"] for d in res_load["data"]["drawings"]}
    assert "draw-bridge-1" in ids
    assert "draw-fib-1" in ids
    assert "draw-pf-1" in ids

    # 4. deleteDrawing
    res_del = json.loads(handler.deleteDrawing('"draw-bridge-1"'))
    assert res_del["ok"] is True
    assert res_del["data"]["deleted"] is True

    # 5. clearDrawings
    res_clear = json.loads(handler.clearDrawings(json.dumps({"symbol": "BTCUSDT", "timeframe": "1H"})))
    assert res_clear["ok"] is True
    assert res_clear["data"]["cleared"] == 2

    # 6. loadDrawings (empty)
    res_load2 = json.loads(handler.loadDrawings(json.dumps({"symbol": "BTCUSDT", "timeframe": "1H"})))
    assert res_load2["ok"] is True
    assert len(res_load2["data"]["drawings"]) == 0

    conn.close()
