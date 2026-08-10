"""Unit tests for SQLite DrawingRegistry (Architecture ``#51``/``#52``)."""
import sqlite3

from app.data.registry.drawing_registry import DrawingRegistry


def test_drawing_crud_lifecycle(tmp_path):
    conn = sqlite3.connect(tmp_path / "test_drawings.sqlite")
    registry = DrawingRegistry(conn)

    # 1. Initially empty
    items = registry.load_drawings("BTCUSDT", "1H")
    assert items == []

    # 2. Save drawing
    d1 = {
        "id": "draw-1",
        "symbol": "BTCUSDT",
        "timeframe": "1H",
        "type": "trend_line",
        "points": [{"timestamp": 1700000000, "price": 40000.0}, {"timestamp": 1700010000, "price": 42000.0}],
        "style": {"color": "#2962ff", "width": 2},
        "locked": False,
        "visible": True,
    }
    registry.save_drawing("BTCUSDT", "1H", "draw-1", "trend_line", d1)

    # 3. Load drawings
    loaded = registry.load_drawings("BTCUSDT", "1H")
    assert len(loaded) == 1
    assert loaded[0]["id"] == "draw-1"
    assert loaded[0]["points"][0]["price"] == 40000.0

    # 4. Save second drawing for different symbol
    d2 = {
        "id": "draw-2",
        "symbol": "ETHUSDT",
        "timeframe": "1H",
        "type": "rectangle",
        "points": [{"timestamp": 1700000000, "price": 2000.0}, {"timestamp": 1700010000, "price": 2200.0}],
        "style": {"color": "#089981", "width": 1},
        "locked": False,
        "visible": True,
    }
    registry.save_drawing("ETHUSDT", "1H", "draw-2", "rectangle", d2)

    assert len(registry.load_drawings("BTCUSDT", "1H")) == 1
    assert len(registry.load_drawings("ETHUSDT", "1H")) == 1

    # 5. Delete drawing
    deleted = registry.delete_drawing("draw-1")
    assert deleted is True
    assert len(registry.load_drawings("BTCUSDT", "1H")) == 0

    # 6. Clear drawings
    cleared = registry.clear_drawings("ETHUSDT", "1H")
    assert cleared == 1
    assert len(registry.load_drawings("ETHUSDT", "1H")) == 0

    conn.close()
