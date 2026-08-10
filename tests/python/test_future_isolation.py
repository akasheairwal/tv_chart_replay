"""Architecture §80 Critical Tests: Future Data Isolation."""
import polars as pl
import pytest

from app.replay.isolation import FutureDataLeakageError, IsolatedDataset


def _sample_frame(count: int = 100) -> pl.DataFrame:
    rows = [[1700000000 + i * 3600, 100.0 + i, 105.0 + i, 99.0 + i, 104.0 + i, 1000.0] for i in range(count)]
    return pl.DataFrame(
        rows,
        schema=[("timestamp", pl.Int64), ("open", pl.Float64), ("high", pl.Float64), ("low", pl.Float64), ("close", pl.Float64), ("volume", pl.Float64)],
        orient="row",
    )


def test_future_data_strictly_blocked():
    """Test 1 (§80): At current_index N, visible length is N+1; future is blocked."""
    dataset = IsolatedDataset(_sample_frame(100))

    # Slice at index 40 -> strictly 41 candles
    visible = dataset.slice_visible(40)
    assert visible.height == 41
    assert visible["timestamp"].max() == 1700000000 + 40 * 3600

    rows = dataset.visible_rows(40)
    assert len(rows) == 41

    # Accessing future candle index 41+ is strictly prohibited
    with pytest.raises(FutureDataLeakageError):
        dataset.candle_at(100)

    with pytest.raises(FutureDataLeakageError):
        dataset.slice_visible(100)


def test_empty_dataset_rejected():
    empty = pl.DataFrame(schema=[("timestamp", pl.Int64), ("open", pl.Float64), ("high", pl.Float64), ("low", pl.Float64), ("close", pl.Float64), ("volume", pl.Float64)])
    with pytest.raises(ValueError, match="empty dataset"):
        IsolatedDataset(empty)
