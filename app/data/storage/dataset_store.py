"""Dataset store: Parquet IO + registry + coverage bookkeeping."""
from __future__ import annotations

from collections import OrderedDict
from pathlib import Path

import polars as pl

from app.config.paths import Paths
from app.data.models.dataset import DatasetInfo, dataset_id_for
from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import Timeframe
from app.data.registry.dataset_registry import DatasetRegistry
from app.data.storage import parquet_store


class DatasetStore:
    """Persistence facade combining Parquet files with the SQLite registry."""

    def __init__(self, paths: Paths, dataset_registry: DatasetRegistry) -> None:
        self.paths = paths
        self.registry = dataset_registry
        self._cache: OrderedDict[tuple[str, str], pl.DataFrame] = OrderedDict()
        self._max_cache_size = 4

    def parquet_path_for(
        self, symbol: Symbol, timeframe: Timeframe, asset_class: AssetClass | str
    ) -> Path:
        asset = asset_class.value if isinstance(asset_class, AssetClass) else asset_class
        cleaned = symbol.symbol.replace("^", "").replace("/", "")
        return self.paths.normalized_dir / asset / cleaned / timeframe.freq / "data.parquet"

    def save_dataset(
        self,
        *,
        symbol: Symbol,
        timeframe: Timeframe,
        asset_class: AssetClass | str,
        provider: str,
        frame: pl.DataFrame,
        exchange: str | None = None,
        timezone: str = "UTC",
        interval_start: int | None = None,
        interval_end: int | None = None,
    ) -> DatasetInfo:
        """Merge ``frame`` into the local dataset and register it as READY.

        Existing coverage is kept: new rows are concatenated and deduplicated
        so partial downloads never drop previously stored candles.
        """
        if frame.height == 0:
            raise ValueError("Cannot save an empty dataset")
        asset = asset_class.value if isinstance(asset_class, AssetClass) else asset_class
        sym_str = getattr(symbol, "symbol", symbol)
        tf_str = getattr(timeframe, "freq", timeframe)
        path = self.parquet_path_for(symbol, timeframe, asset)

        existing = self.load_all(symbol, timeframe)
        if existing.height:
            combined = (
                pl.concat([existing, frame])
                .unique(subset=["timestamp"], keep="last")
                .sort("timestamp")
            )
        else:
            combined = (
                frame.unique(subset=["timestamp"], keep="last")
                .sort("timestamp")
            )

        size = parquet_store.write_dataframe(path, combined)
        checksum = parquet_store.compute_checksum(path)
        info = self.registry.upsert_with_data(
            dataset_id=dataset_id_for(sym_str, tf_str),
            symbol=sym_str,
            asset_class=asset,
            exchange=exchange,
            provider=provider,
            timeframe=tf_str,
            start_timestamp=int(combined["timestamp"].min()),
            end_timestamp=int(combined["timestamp"].max()),
            row_count=combined.height,
            file_path=str(path),
            file_size=size,
            checksum=checksum,
            timezone=timezone,
        )
        self.registry.add_coverage(
            info.dataset_id,
            interval_start if interval_start is not None else int(combined["timestamp"].min()),
            interval_end if interval_end is not None else int(combined["timestamp"].max()),
            provider,
        )
        self.registry.set_status(info.dataset_id, "READY")
        if len(self._cache) >= self._max_cache_size:
            self._cache.popitem(last=False)
        self._cache[(sym_str, tf_str)] = combined
        return self.registry.info(sym_str, tf_str)

    def load_all(self, symbol: Symbol | str, timeframe: Timeframe | str) -> pl.DataFrame:
        sym_str = getattr(symbol, "symbol", symbol)
        tf_str = getattr(timeframe, "freq", timeframe)
        key = (sym_str, tf_str)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]

        info = self.registry.get(sym_str, tf_str)
        if info is None or not info.file_path or not Path(info.file_path).exists():
            return parquet_store.empty_canonical()
        frame = parquet_store.read_all(Path(info.file_path))
        if frame.height > 0:
            if len(self._cache) >= self._max_cache_size:
                self._cache.popitem(last=False)
            self._cache[key] = frame
        return frame

    def load_range(
        self,
        symbol: Symbol | str,
        timeframe: Timeframe | str,
        start_s: int | None = None,
        end_s: int | None = None,
        columns: list[str] | None = None,
    ) -> pl.DataFrame:
        sym_str = getattr(symbol, "symbol", symbol)
        target_tf = timeframe if isinstance(timeframe, Timeframe) else Timeframe.parse(timeframe)
        tf_str = target_tf.freq

        key = (sym_str, tf_str)
        if key in self._cache:
            self._cache.move_to_end(key)
            cached = self._cache[key]
            if start_s is not None or end_s is not None or columns is not None:
                res = cached
                if start_s is not None:
                    res = res.filter(pl.col("timestamp") >= start_s)
                if end_s is not None:
                    res = res.filter(pl.col("timestamp") <= end_s)
                if columns is not None:
                    avail = [c for c in columns if c in res.columns]
                    res = res.select(avail)
                return res
            return cached

        info = self.registry.get(sym_str, tf_str)
        if info is not None and info.file_path and Path(info.file_path).exists():
            if start_s is None and end_s is None and columns is None:
                return self.load_all(symbol, timeframe)
            return parquet_store.read_range(Path(info.file_path), start_s, end_s, columns)

        # Fallback: check if a finer base timeframe exists for this symbol and resample
        all_stored = [d for d in self.registry.list_all() if d.symbol == sym_str and d.file_path and Path(d.file_path).exists()]
        eligible = []
        for stored in all_stored:
            try:
                candidate_tf = Timeframe.parse(stored.timeframe)
                if candidate_tf.seconds <= target_tf.seconds:
                    eligible.append((candidate_tf, stored))
            except (ValueError, TypeError):
                continue

        if not eligible:
            return parquet_store.empty_canonical()

        # Pick the finest available base timeframe
        eligible.sort(key=lambda x: x[0].seconds)
        source_tf, base_stored = eligible[0]
        base_frame = parquet_store.read_range(Path(base_stored.file_path), start_s, end_s, columns=None)
        if base_frame.height == 0:
            return parquet_store.empty_canonical()

        from app.data.normalization.resampler import resample
        resampled = resample(base_frame, source_tf, target_tf)
        if columns is not None:
            available = [c for c in columns if c in resampled.columns]
            return resampled.select(available)
        return resampled

    def load_window(
        self,
        symbol: Symbol | str,
        timeframe: Timeframe | str,
        max_rows: int = 5000,
        offset: int = 0,
    ) -> pl.DataFrame:
        """Load a bounded window slice of candles for responsive UI rendering."""
        df = self.load_range(symbol, timeframe)
        if df.height > max_rows:
            start_idx = max(0, df.height - max_rows - offset)
            end_idx = max(0, df.height - offset)
            return df.slice(start_idx, max(0, end_idx - start_idx))
        return df

    def dataset_info(self, symbol: Symbol | str, timeframe: Timeframe | str) -> DatasetInfo | None:
        sym_str = getattr(symbol, "symbol", symbol)
        tf_str = getattr(timeframe, "freq", timeframe)
        return self.registry.info(sym_str, tf_str)

    def missing_intervals(
        self, symbol: Symbol | str, timeframe: Timeframe | str, start_s: int, end_s: int
    ) -> list[tuple[int, int]]:
        sym_str = getattr(symbol, "symbol", symbol)
        tf_str = getattr(timeframe, "freq", timeframe)
        return self.registry.missing_intervals(
            dataset_id_for(sym_str, tf_str), start_s, end_s
        )