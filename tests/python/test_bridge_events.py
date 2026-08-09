"""Bridge command handler + serialization unit tests (no web engine)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.bridge.commands import BridgeCommandHandler
from app.bridge.events import serialize_payload
from app.bridge.serializers import compact_candles, is_finite, to_epoch_seconds


def test_system_ping_round_trip(session_app) -> None:
    handler = BridgeCommandHandler(app_version="0.1.0")
    assert handler.systemPing("hello") == "pong:hello"
    assert handler.ping_count == 1
    assert handler.last_ping_message == "hello"


def test_system_version_reported(session_app) -> None:
    handler = BridgeCommandHandler(app_version="9.9.9")
    assert handler.systemVersion() == "9.9.9"


def test_bridge_surface_is_explicit(session_app) -> None:
    """Only the registered whitelisted slots must exist on the handler."""
    handler = BridgeCommandHandler()
    assert hasattr(handler, "systemVersion")
    assert hasattr(handler, "systemPing")
    assert hasattr(handler, "systemLog")
    assert hasattr(handler, "eventEmitted")
    assert not hasattr(handler, "eval")
    assert not hasattr(handler, "exec")


def test_event_payload_serialization() -> None:
    text = serialize_payload({"job_id": "abc", "percent": 72.4})
    assert '"job_id":"abc"' in text
    assert '"percent":72.4' in text


def test_compact_candles_transfer_shape() -> None:
    rows = [[1700000000, 1.0, 2.0, 0.5, 1.5, 100]]
    result = compact_candles(rows)
    assert result[0][0] == 1700000000
    assert all(isinstance(value, float) for value in result[0][1:])
    assert result[0][-1] == 100.0


def test_epoch_conversion_utc() -> None:
    dt = datetime(2020, 1, 1, tzinfo=UTC)
    assert to_epoch_seconds(dt) == 1577836800
    # naive datetimes are assumed UTC
    naive = datetime(2020, 1, 1, tzinfo=UTC).replace(tzinfo=None)
    assert to_epoch_seconds(naive) == 1577836800


def test_finite_check() -> None:
    assert is_finite(1.5)
    assert is_finite(0)
    assert not is_finite(float("nan"))
    assert not is_finite(float("inf"))
    assert not is_finite("1.5")
