"""Random replay start selection (architecture ``#38``)."""
from __future__ import annotations

import random


def select_random_replay_window(
    total_candles: int,
    *,
    warmup_candles: int = 250,
    replay_length: int = 500,
    seed: int | None = None,
) -> tuple[int, int, int]:
    """Select a valid start index and end index for a random replay session.

    Returns:
        tuple of `(start_index, end_index, effective_warmup)` where:
        - `start_index` has at least `effective_warmup` candles before it (`>= effective_warmup`).
        - `end_index` is at least `start_index + 1`.
    """
    if total_candles <= 1:
        raise ValueError(f"Not enough candles for replay: {total_candles}")

    rng = random.Random(seed)

    # Adjust warmup if dataset is smaller than requested warmup + replay_length
    if total_candles < warmup_candles + 10:
        effective_warmup = max(1, total_candles // 4)
    else:
        effective_warmup = warmup_candles

    min_start = effective_warmup
    max_start = max(min_start, total_candles - 10)

    if min_start >= max_start:
        start_index = min_start
    else:
        start_index = rng.randint(min_start, max_start)

    end_index = min(total_candles - 1, start_index + replay_length)
    if end_index <= start_index:
        end_index = min(total_candles - 1, start_index + 1)

    return start_index, end_index, effective_warmup
