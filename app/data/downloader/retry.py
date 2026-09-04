"""Retry / exponential backoff helpers."""
from __future__ import annotations

import random
import time
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


def exponential_backoff(
    attempt: int, base_seconds: float = 1.0, max_seconds: float = 30.0, jitter: bool = True
) -> float:
    """Delay for ``attempt`` (0-based) with optional full jitter."""
    delay = min(base_seconds * (2**attempt), max_seconds)
    return delay * random.uniform(0.5, 1.0) if jitter else delay


def with_retries(
    fn: Callable[[], T],
    *,
    attempts: int = 3,
    exceptions: tuple[type[Exception], ...] = (Exception,),
    base_seconds: float = 1.0,
    max_seconds: float = 30.0,
    on_retry: Callable[[int, float, Exception], None] | None = None,
) -> T:
    """Run ``fn`` with exponential backoff on the given exception types."""
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return fn()
        except exceptions as exc:
            last_error = exc
            if attempt == attempts - 1:
                break
            delay = exponential_backoff(attempt, base_seconds, max_seconds)
            if on_retry:
                on_retry(attempt + 1, delay, exc)
            time.sleep(delay)
    assert last_error is not None
    raise last_error