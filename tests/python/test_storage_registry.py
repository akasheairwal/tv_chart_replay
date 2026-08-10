"""Storage: SQLite registry, coverage math, Parquet + dataset store."""

from __future__ import annotations

from pathlib import Path

import polars as pl

from app.config.paths import Paths
from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import H1
from app.data.registry.dataset_registry import DatasetRegistry
from app.data.storage import parquet_store
from app.data.storage.dataset_store import DatasetStore
from app.database.connection import connect

BASE = 1_700_000_000


def _frame(count: int, step_s: int = 3600) -> pl.DataFrame:
    rows = [[BASE + i * step_s, 100.0, 105.0, 99.0, 102.0, 10.0] for i in range(count)]
    return pl.DataFrame(
        rows,
        schema=[
            ("timestamp", pl.Int64),
            ("open", pl.Float64),
            ("high", pl.Float64),
            ("low", pl.Float64),
            ("close", pl.Float64),
            ("volume", pl.Float64),
        ],
        orient="row",
    )


def test_coverage_missing_intervals(tmp_path) -> None:
    conn = connect(tmp_path / "db.sqlite")
    registry = DatasetRegistry(conn)
    registry.upsert_missing(dataset_id="ABC-1H", symbol="ABC", asset_class="crypto", timeframe="1H")
    registry.add_coverage("ABC-1H", 100, 200, "fake")
    registry.add_coverage("ABC-1H", 210, 300, "fake")

    # Adjacent intervals are merged into one contiguous range.
    assert registry.intervals("ABC-1H") == [(100, 300)]

    # Middle and trailing gaps are computed.
    registry.add_coverage("ABC-1H", 400, 500, "fake")
    missing = registry.missing_intervals("ABC-1H", 50, 600)
    assert missing == [(50, 99), (301, 399), (501, 600)]

    # Fully covered request -> nothing missing.
    assert registry.missing_intervals("ABC-1H", 150, 250) == []
    conn.close()


def test_dataset_registry_lifecycle(tmp_path) -> None:
    conn = connect(tmp_path / "db.sqlite")
    registry = DatasetRegistry(conn)
    registry.upsert_missing(
        dataset_id="EURUSD-1H", symbol="EURUSD", asset_class="forex", timeframe="1H"
    )
    stored = registry.get("EURUSD", "1H")
    assert stored is not None and stored.status == "MISSING"

    info = registry.upsert_with_data(
        dataset_id="EURUSD-1H",
        symbol="EURUSD",
        asset_class="forex",
        exchange="FX",
        provider="fake",
        timeframe="1H",
        start_timestamp=1000,
        end_timestamp=2000,
        row_count=20,
        file_path=str(tmp_path / "data.parquet"),
        file_size=123,
        checksum="abc",
    )
    assert info.status == "READY"
    assert info.dataset_version == 1

    # Re-saving identical checksum keeps the version; a new checksum bumps it.
    info2 = registry.upsert_with_data(
        dataset_id="EURUSD-1H",
        symbol="EURUSD",
        asset_class="forex",
        exchange="FX",
        provider="fake",
        timeframe="1H",
        start_timestamp=1000,
        end_timestamp=3000,
        row_count=30,
        file_path=str(tmp_path / "data.parquet"),
        file_size=456,
        checksum="bcd",
    )
    assert info2.dataset_version == 2

    public = registry.info("EURUSD", "1H")
    assert public is not None
    assert public.dataset_version == 2
    assert public.coverage == []
    conn.close()


def test_parquet_round_trip_and_window(tmp_path) -> None:
    data_dir = tmp_path / "data"
    path = data_dir / "one.parquet"
    size = parquet_store.write_dataframe(path, _frame(10))
    assert size > 0
    assert len(parquet_store.compute_checksum(path)) == 64

    all_rows = parquet_store.read_all(path)
    assert all_rows.height == 10

    window = parquet_store.read_range(path, start_s=BASE + 3 * 3600, end_s=BASE + 6 * 3600)
    assert window.height == 4
    assert window["timestamp"].min() == BASE + 3 * 3600

    subset = parquet_store.read_range(path, columns=["timestamp", "close"])
    assert subset.columns == ["timestamp", "close"]
    assert len(parquet_store.compute_checksum(path)) == 64


def test_dataset_store_save_and_partial_merge(tmp_path) -> None:
    conn = connect(tmp_path / "db.sqlite")
    registry = DatasetRegistry(conn)
    paths = Paths.create(tmp_path)
    store = DatasetStore(paths, registry)

    symbol = Symbol("BTCUSDT", "Bitcoin", AssetClass.CRYPTO, "BINANCE")
    info = store.save_dataset(
        symbol=symbol,
        timeframe=H1,
        asset_class=AssetClass.CRYPTO,
        provider="fake",
        frame=_frame(10),
    )
    assert info.status == "READY"
    assert info.row_count == 10
    assert info.dataset_version == 1
    assert Path(info.file_path).is_file()

    # Saving a later, overlapping range merges - no row loss or dupes.
    later = _frame(10, 3600)  # same timestamps -> duplicates
    info2 = store.save_dataset(
        symbol=symbol,
        timeframe=H1,
        asset_class=AssetClass.CRYPTO,
        provider="fake",
        frame=later,
        interval_start=BASE,
        interval_end=BASE + 9 * 3600,
    )
    assert info2.row_count == 10  # deduplicated

    # A genuinely new tail extends the dataset.
    tail = _frame(5)
    tail = tail.with_columns(pl.col("timestamp") + 20 * 3600)
    info3 = store.save_dataset(
        symbol=symbol,
        timeframe=H1,
        asset_class=AssetClass.CRYPTO,
        provider="fake",
        frame=tail,
        interval_start=BASE + 20 * 3600,
        interval_end=BASE + 24 * 3600,
    )
    assert info3.row_count == 15

    loaded = store.load_range(symbol, H1, start_s=BASE, end_s=BASE + 24 * 3600)
    assert loaded.height == 15
    assert registry.intervals(info.dataset_id) == [
        (BASE, BASE + 9 * 3600),
        (BASE + 20 * 3600, BASE + 24 * 3600),
    ]

    # Test resampler fallback when 4H is requested but 1H is stored
    from app.data.models.timeframe import H4
    resampled_4h = store.load_range(symbol, H4)
    assert resampled_4h.height > 0
    assert "timestamp" in resampled_4h.columns
    conn.close()
