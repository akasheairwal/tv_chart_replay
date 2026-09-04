"""Per-provider rate limiting (architecture ``#13``)."""
from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager


class RateLimiter:
    """Serializes provider requests: min interval + max concurrency."""

    def __init__(self, min_interval_ms: float = 500.0, max_concurrency: int = 1) -> None:
        self.min_interval_ms = min_interval_ms
        self.max_concurrency = max_concurrency
        self._condition = threading.Condition()
        self._inflight = 0
        self._last_start_monotonic = 0.0

    @contextmanager
    def acquire(self) -> Iterator[None]:
        """Block until a request slot is available, then yield."""
        with self._condition:
            while True:
                if self._inflight >= self.max_concurrency:
                    self._condition.wait()
                    continue
                now = time.monotonic()
                wait = self.min_interval_ms / 1000.0 - (now - self._last_start_monotonic)
                if wait > 0:
                    # Re-check the predicate after the timed wait; waking at
                    # the deadline does not guarantee the slot is still free
                    # or that the spacing is still respected.
                    self._condition.wait(wait)
                    continue
                break
            self._inflight += 1
            self._last_start_monotonic = time.monotonic()
        try:
            yield
        finally:
            with self._condition:
                self._inflight -= 1
                self._condition.notify_all()