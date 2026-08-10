"""End-to-end DownloadManager tests using a fake provider (offline)."""

from __future__ import annotations

import time
from collections.abc import Callable

from fakes import FakeProvider, collect_events, make_frame

from app.config.paths import Paths
from app.data.downloader.manager import DownloadManager
from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import H1
from app.data.providers.registry import ProviderRegistry
from app.data.registry.dataset_registry import DatasetRegistry
from app.data.storage.dataset_store import DatasetStore
from app.database.connection import connect

START = 1_700_000_000
END = START + 9 * 3600


def _build(tmp_path):
    conn = connect(tmp_path / "db.sqlite")
    registry = DatasetRegistry(conn)
    paths = Paths.create(tmp_path)
    store = DatasetStore(paths, registry)
    return conn, registry, store


def poll_until(condition: Callable[[], bool], timeout: float = 10.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.05)
    return condition()


def _crypto_symbol() -> Symbol:
    return Symbol(
        symbol="BTCUSDT",
        display_name="Bitcoin / Tether",
        asset_class=AssetClass.CRYPTO,
        exchange="BINANCE",
        provider_candidates=["fake"],
    )


def test_download_flow_saves_dataset(tmp_path) -> None:
    conn, registry, store = _build(tmp_path)
    provider = FakeProvider(frame=make_frame(count=10))
    events, emit = collect_events()
    manager = DownloadManager(
        ProviderRegistry([provider]),
        registry,
        store,
        emit=emit,
        min_request_interval_ms=0,
    )

    result = manager.request_dataset(_crypto_symbol(), H1, start_s=START, end_s=END)
    assert result["status"] == "downloading"
    assert provider.download_calls == 0  # async

    assert poll_until(
        lambda: (
            registry.info("BTCUSDT", "1H") is not None
            and registry.info("BTCUSDT", "1H").status == "READY"
        )
    )
    manager.wait()

    info = registry.info("BTCUSDT", "1H")
    assert info.row_count == 10
    assert info.provider == "fake"
    assert registry.intervals(info.dataset_id) == [(START, END)]

    names = [name for name, _ in events]
    assert "download.started" in names
    assert "download.completed" in names
    assert "dataset.updated" in names
    assert "dataset.ready" in names

    # The second request is fully covered -> no new download.
    result2 = manager.request_dataset(_crypto_symbol(), H1, start_s=START, end_s=END)
    assert result2["status"] == "ready"
    assert provider.download_calls == 1
    conn.close()


def test_retry_then_success(tmp_path) -> None:
    conn, registry, store = _build(tmp_path)
    provider = FakeProvider(frame=make_frame(count=5), failures_before_success=2)
    _events, emit = collect_events()
    manager = DownloadManager(
        ProviderRegistry([provider]), registry, store, emit=emit, min_request_interval_ms=0
    )

    manager.request_dataset(_crypto_symbol(), H1, start_s=START, end_s=START + 4 * 3600)
    assert poll_until(
        lambda: (
            registry.info("BTCUSDT", "1H") is not None
            and registry.info("BTCUSDT", "1H").status == "READY"
        )
    )
    assert provider.download_calls == 3  # 2 failures + 1 success
    manager.wait()
    conn.close()


def test_download_failure_emits_failed(tmp_path) -> None:
    conn, registry, store = _build(tmp_path)
    provider = FakeProvider(frame=make_frame(count=5), failures_before_success=1000)
    events, emit = collect_events()
    manager = DownloadManager(
        ProviderRegistry([provider]), registry, store, emit=emit, min_request_interval_ms=0
    )

    manager.request_dataset(_crypto_symbol(), H1, start_s=START, end_s=START + 4 * 3600)
    assert poll_until(lambda: any(name == "download.failed" for name, _ in events))
    assert not any(name == "download.completed" for name, _ in events)
    info = registry.info("BTCUSDT", "1H")
    assert info is not None and info.status == "FAILED"
    manager.wait()
    conn.close()


def test_no_provider_reports_error(tmp_path) -> None:
    conn, registry, store = _build(tmp_path)
    _events, emit = collect_events()
    manager = DownloadManager(ProviderRegistry([]), registry, store, emit=emit)

    from app.data.errors import DatasetCoverageError

    try:
        manager.request_dataset(_crypto_symbol(), H1)
    except DatasetCoverageError:
        pass
    else:
        raise AssertionError("expected DatasetCoverageError when no provider exists")
    manager.wait()
    conn.close()
