"""Bridge data commands against fake services (no Qt window needed)."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from types import SimpleNamespace

from fakes import FakeProvider, collect_events, make_frame

from app.bridge.commands import BridgeCommandHandler
from app.config.paths import Paths
from app.data.downloader.manager import DownloadManager
from app.data.providers.registry import ProviderRegistry
from app.data.registry.dataset_registry import DatasetRegistry
from app.data.registry.symbol_registry import SymbolRegistry
from app.data.storage.dataset_store import DatasetStore
from app.database.connection import connect

START = 1_700_000_000
END = START + 9 * 3600


def poll_until(condition: Callable[[], bool], timeout: float = 10.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.05)
    return condition()


def _handler(tmp_path) -> BridgeCommandHandler:
    conn = connect(tmp_path / "db.sqlite")
    symbol_registry = SymbolRegistry(conn)  # seeds the curated catalog
    dataset_registry = DatasetRegistry(conn)
    store = DatasetStore(Paths.create(tmp_path), dataset_registry)
    _events, emit = collect_events()
    manager = DownloadManager(
        ProviderRegistry([FakeProvider(frame=make_frame(count=10))]),
        dataset_registry,
        store,
        emit=emit,
        min_request_interval_ms=0,
    )

    services = SimpleNamespace(
        symbol_registry=symbol_registry,
        dataset_registry=dataset_registry,
        dataset_store=store,
        download_manager=manager,
    )

    handler = BridgeCommandHandler(app_version="0.1.0")
    handler.attach_services(services)
    return handler


def _unpack(raw: str) -> dict:
    return json.loads(raw)


def test_search_symbols(session_app, tmp_path) -> None:
    handler = _handler(tmp_path)
    result = _unpack(handler.searchSymbols("eur"))
    assert result["ok"] is True
    symbols = [row["symbol"] for row in result["data"]]
    assert "EURUSD" in symbols


def test_search_symbols_no_match(session_app, tmp_path) -> None:
    handler = _handler(tmp_path)
    result = _unpack(handler.searchSymbols("zzzznope"))
    assert result["ok"] is True
    assert result["data"] == []


def test_request_dataset_then_load_history(session_app, tmp_path) -> None:
    handler = _handler(tmp_path)

    response = _unpack(
        handler.requestDataset(
            json.dumps({"symbol": "BTCUSDT", "timeframe": "1H", "start_s": START, "end_s": END})
        )
    )
    assert response["ok"] is True
    assert response["data"]["status"] == "downloading"

    services = handler.services
    assert poll_until(
        lambda: (
            services.dataset_registry.info("BTCUSDT", "1H") is not None
            and services.dataset_registry.info("BTCUSDT", "1H").status == "READY"
        )
    )

    history = _unpack(handler.loadHistory(json.dumps({"symbol": "BTCUSDT", "timeframe": "1H"})))
    assert history["ok"] is True
    assert history["data"]["count"] == 10
    assert history["data"]["columns"] == ["timestamp", "open", "high", "low", "close", "volume"]
    assert len(history["data"]["rows"][0]) == 6


def test_load_history_missing_dataset_is_ok(session_app, tmp_path) -> None:
    handler = _handler(tmp_path)
    history = _unpack(handler.loadHistory(json.dumps({"symbol": "EURUSD", "timeframe": "1H"})))
    assert history["ok"] is True
    assert history["data"]["count"] == 0


def test_unknown_symbol_errors(session_app, tmp_path) -> None:
    handler = _handler(tmp_path)
    response = _unpack(handler.requestDataset(json.dumps({"symbol": "NOTREAL", "timeframe": "1H"})))
    assert response["ok"] is False
    assert "Unknown symbol" in response["error"]


def test_invalid_timeframe_errors(session_app, tmp_path) -> None:
    handler = _handler(tmp_path)
    response = _unpack(handler.requestDataset(json.dumps({"symbol": "BTCUSDT", "timeframe": "7m"})))
    assert response["ok"] is False


def test_commands_without_services_error(session_app) -> None:
    handler = BridgeCommandHandler(app_version="0.1.0")
    result = _unpack(handler.searchSymbols("eur"))
    assert result["ok"] is False
