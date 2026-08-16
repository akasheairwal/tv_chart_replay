"""Architecture §80 Critical Tests: Replay Engine Lifecycle & Pacing."""
import polars as pl
import pytest

from app.replay.engine import ReplayEngine
from app.replay.state import ReplayStatus


def _sample_frame(count: int = 100) -> pl.DataFrame:
    rows = [[1700000000 + i * 3600, 100.0 + i, 105.0 + i, 99.0 + i, 104.0 + i, 1000.0] for i in range(count)]
    return pl.DataFrame(
        rows,
        schema=[("timestamp", pl.Int64), ("open", pl.Float64), ("high", pl.Float64), ("low", pl.Float64), ("close", pl.Float64), ("volume", pl.Float64)],
        orient="row",
    )


def test_replay_step_forward_and_backward():
    """Test 3 & 4 (§80): Step forward (N -> N+1) and step backward (N -> N-1)."""
    events = []
    engine = ReplayEngine(emit=lambda name, payload: events.append((name, payload)))

    frame = _sample_frame(100)
    state = engine.create_replay("BTCUSDT", "1H", frame, start_index=10, warmup_candles=10)

    assert state.current_index == 10
    assert state.status == ReplayStatus.PAUSED
    assert len(engine.visible_candles()) == 11

    # Step forward 1
    state, new_candles = engine.step_forward(1)
    assert state.current_index == 11
    assert len(new_candles) == 1
    assert len(engine.visible_candles()) == 12

    # Step forward 5
    events.clear()
    state, new_candles = engine.step_forward(5)
    assert state.current_index == 16
    assert len(new_candles) == 5
    assert len(engine.visible_candles()) == 17
    emitted_candle_events = [e[1] for e in events if e[0] == "replay.candle"]
    assert len(emitted_candle_events) == 5
    assert [e["index"] for e in emitted_candle_events] == [12, 13, 14, 15, 16]

    # Step backward 3
    state, visible = engine.step_backward(3)
    assert state.current_index == 13
    assert len(visible) == 14
    assert len(engine.visible_candles()) == 14


def test_replay_end_reaches_finished():
    """Test 5 (§80): When end_index is reached, transitions to FINISHED and emits replay.finished."""
    events = []
    engine = ReplayEngine(emit=lambda name, payload: events.append((name, payload)))

    frame = _sample_frame(20)
    state = engine.create_replay("BTCUSDT", "1H", frame, start_index=18, warmup_candles=18)

    # Step to end
    state, new_candles = engine.step_forward(1)
    assert state.current_index == 19
    assert state.is_finished
    assert any(name == "replay.finished" for name, _ in events)

    # Further step returns empty
    state, new_candles = engine.step_forward(1)
    assert state.is_finished
    assert len(new_candles) == 0


def test_replay_reset():
    """Test 6 (§80): reset() returns index to start_index."""
    engine = ReplayEngine()
    frame = _sample_frame(50)
    engine.create_replay("BTCUSDT", "1H", frame, start_index=15)

    engine.step_forward(10)
    assert engine.state.current_index == 25

    state, visible = engine.reset()
    assert state.current_index == 15
    assert len(visible) == 16


def test_replay_jump_to():
    engine = ReplayEngine()
    frame = _sample_frame(50)
    engine.create_replay("BTCUSDT", "1H", frame, start_index=10)

    state, visible = engine.jump_to(35)
    assert state.current_index == 35
    assert len(visible) == 36

    # Jump by timestamp
    target_ts = 1700000000 + 20 * 3600
    state, visible = engine.jump_to(target_ts)
    assert state.current_index == 20
    assert len(visible) == 21


def test_random_replay_bounds():
    """Test 7 (§80): Random replay starts within valid bounds with warmup."""
    engine = ReplayEngine()
    frame = _sample_frame(200)
    state = engine.create_random_replay("BTCUSDT", "1H", frame, warmup_candles=50, replay_length=100, seed=42)

    assert state.current_index >= 50
    assert state.end_index <= 199
    assert state.current_index < state.end_index
    assert len(engine.visible_candles()) == state.current_index + 1


def test_replay_speed_setting():
    engine = ReplayEngine()
    frame = _sample_frame(50)
    engine.create_replay("BTCUSDT", "1H", frame, speed=1.0)

    state = engine.set_speed(5.0)
    assert state.speed == 5.0

    with pytest.raises(ValueError):
        engine.set_speed(-1.0)
