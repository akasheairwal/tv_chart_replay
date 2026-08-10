"""
Unit tests for MasterReplayClock (Wave 8).
"""

from app.replay.master_clock import MasterReplayClock


def test_master_clock_register_and_sync():
    clock = MasterReplayClock()
    clock.register_chart("chart_1", "EURUSD", "1H")
    clock.register_chart("chart_2", "EURUSD", "15m")

    ticked = []
    clock._on_tick = lambda ts, payload: ticked.append(payload)

    updates = clock.sync_tick(1700000000, {"chart_1": 100, "chart_2": 400})
    assert updates["master_timestamp"] == 1700000000
    assert updates["updates"]["chart_1"]["index"] == 100
    assert updates["updates"]["chart_2"]["index"] == 400
    assert len(ticked) == 1


def test_master_clock_unregister():
    clock = MasterReplayClock()
    clock.register_chart("chart_1", "EURUSD", "1H")
    clock.unregister_chart("chart_1")
    assert "chart_1" not in clock.slaves
