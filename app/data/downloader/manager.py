"""Download orchestration (architecture ``#14``/``#15``/``#16``).

`DownloadManager` resolves a provider per missing interval, drives the
job through its state machine on a background thread, and streams
structured events (``download.*`` / ``dataset.*``) for the bridge.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import polars as pl

from app.data.downloader.job import DownloadJob, DownloadJobState
from app.data.downloader.rate_limiter import RateLimiter
from app.data.downloader.retry import with_retries
from app.data.errors import (
    DataProviderError,
    DatasetCoverageError,
    DownloadError,
    ProviderUnavailableError,
    ValidationError,
)
from app.data.models.dataset import dataset_id_for
from app.data.models.symbol import AssetClass, Symbol
from app.data.models.timeframe import Timeframe
from app.data.normalization.normalizer import normalize
from app.data.providers.base import DataProvider
from app.data.providers.registry import ProviderRegistry
from app.data.registry.dataset_registry import DatasetRegistry
from app.data.storage.dataset_store import DatasetStore
from app.data.validation.gap_detector import detect_gaps
from app.data.validation.validator import validate

logger = logging.getLogger(__name__)

EventEmitter = Callable[[str, dict[str, Any]], None]


def fully_within_market_closure(asset_class: AssetClass | str, start_s: int, end_s: int) -> bool:
    """True when the whole window sits inside a guaranteed market closure.

    Non-crypto markets are closed from Friday 20:00 UTC to Monday 00:00 UTC
    (covers FX late-Friday close through Sunday open and equity weekends).
    Windows entirely inside that stretch can NEVER yield candles - treating
    them as failures caused permanent unfillable "missing intervals" that
    re-fetched every startup.
    """
    if isinstance(asset_class, str):
        try:
            asset_class = AssetClass(asset_class)
        except ValueError:
            return False
    if asset_class == AssetClass.CRYPTO:
        return False  # 24/7 market - an empty window is a real problem

    start = datetime.fromtimestamp(int(start_s), UTC)
    end = datetime.fromtimestamp(int(end_s), UTC)

    # Most recent Friday 20:00 at or before `start`.
    days_since_friday = (start.weekday() - 4) % 7
    closure_start = (start - timedelta(days=days_since_friday)).replace(
        hour=20, minute=0, second=0, microsecond=0
    )
    if closure_start > start:
        closure_start -= timedelta(days=7)
    # Closure ends Monday 00:00 (= Friday 20:00 + 2d4h).
    closure_end = closure_start + timedelta(days=2, hours=4)

    return start >= closure_start and end <= closure_end


def is_sub_bar_interval(timeframe: Timeframe, start_s: int, end_s: int) -> bool:
    """True when [start_s, end_s] is strictly inside a single bar span (cannot contain any bar start)."""
    if int(end_s) < int(start_s):
        return True
    tf_s = timeframe.seconds
    if tf_s <= 0:
        return False
    return (int(end_s) - int(start_s)) < tf_s and (int(start_s) // tf_s) == (int(end_s) // tf_s)


class DownloadManager:
    def __init__(
        self,
        providers: ProviderRegistry,
        dataset_registry: DatasetRegistry,
        dataset_store: DatasetStore,
        emit: EventEmitter,
        *,
        min_request_interval_ms: float = 250.0,
    ) -> None:
        self.providers = providers
        self.dataset_registry = dataset_registry
        self.dataset_store = dataset_store
        self._emit = emit
        self._min_request_interval_ms = min_request_interval_ms
        self._limiters: dict[str, RateLimiter] = {}
        self._threads: set[threading.Thread] = set()
        self._inflight: set[str] = set()
        self._provider_health: dict[str, int] = {}

    # -- public API --------------------------------------------------

    def request_dataset(
        self,
        symbol: Symbol,
        timeframe: Timeframe,
        start_s: int | None = None,
        end_s: int | None = None,
    ) -> dict[str, Any]:
        """Ensure local coverage; download only what is missing.

        Returns immediately - downloads run on a background thread and
        stream progress through events.
        """
        requested_start, requested_end = self._coverage_window(
            symbol, timeframe, start_s, end_s
        )
        dataset_id = dataset_id_for(symbol.symbol, timeframe)

        missing = self.dataset_registry.missing_intervals(
            dataset_id, requested_start, requested_end
        )
        if not missing:
            info = self.dataset_registry.info(symbol.symbol, timeframe)
            if info is not None:
                if info.status != "READY" and (info.row_count or 0) > 0:
                    self.dataset_registry.set_status(dataset_id, "READY")
                # No event: fully-covered requests are routine (every UI
                # reload) and `dataset.updated` signals real changes.
                return {"status": "ready", "dataset": info.to_dict()}

        if self.dataset_registry.get(symbol.symbol, timeframe) is None:
            self.dataset_registry.upsert_missing(
                dataset_id=dataset_id,
                symbol=symbol.symbol,
                asset_class=symbol.asset_class.value,
                timeframe=timeframe.freq,
                exchange=symbol.exchange,
                timezone=symbol.timezone,
            )

        # Pre-mark fully-closed intervals (weekends/holidays) and sub-bar slivers as covered
        # SYNCHRONOUSLY: spawning workers + events for them caused the UI to
        # re-request in a 1 Hz loop while hundreds of legacy second-wide
        # fragments drained one spawn at a time.
        remaining: list[tuple[int, int]] = []
        closed_count = 0
        for s, e in missing:
            if fully_within_market_closure(symbol.asset_class, s, e) or is_sub_bar_interval(timeframe, s, e):
                self._mark_closed(symbol, timeframe, s, e)
                closed_count += 1
            else:
                remaining.append((s, e))
        if closed_count:
            # Slivers (the live "now" edge creeping through a weekend) are
            # routine - keep them quiet; larger batches are worth an INFO.
            log = logger.info if closed_count >= 3 else logger.debug
            log(
                "marked %d market-closure/sub-bar interval(s) covered for %s@%s",
                closed_count,
                symbol.symbol,
                timeframe.freq,
            )
        missing = remaining

        if not missing:
            info = self.dataset_registry.info(symbol.symbol, timeframe)
            if info is not None and info.status != "READY" and (info.row_count or 0) > 0:
                self.dataset_registry.set_status(dataset_id, "READY")
            # Nothing tradable to fetch. Deliberately NO dataset.ready event
            # here: during weekends the requested window's `now` edge grows
            # by 1s per call, and emitting caused the frontend to re-request
            # forever (1 Hz closure-marking loop). The direct return value
            # informs the caller; dataset.updated covers real fetches.
            return {
                "status": "ready",
                "dataset_id": dataset_id,
                "missed_intervals": [],
            }
        # Tell the UI data is missing locally and a fetch is starting
        # (data-status listens for this event; it was previously emitted
        # by nothing, leaving the listener dead).
        self._emit(
            "dataset.missing",
            {
                "dataset_id": dataset_id,
                "symbol": symbol.symbol,
                "timeframe": timeframe.freq,
                "missing_intervals": len(missing),
            },
        )

        # Deduplicate concurrent requests for the same dataset: a second UI
        # trigger while a worker is already running would spawn a duplicate
        # worker racing over the same coverage rows.
        inflight_key = f"{symbol.symbol}@{timeframe.freq}"
        if inflight_key in self._inflight:
            return {
                "status": "downloading",
                "dataset_id": dataset_id,
                "missed_intervals": [],
                "deduplicated": True,
            }
        self._inflight.add(inflight_key)
        self._spawn(self._process_intervals, (symbol, timeframe, missing, inflight_key))
        return {
            "status": "downloading",
            "dataset_id": dataset_id,
            "missed_intervals": [[s, e] for s, e in missing],
        }

    # -- workers -----------------------------------------------------

    def _process_intervals(
        self,
        symbol: Symbol,
        timeframe: Timeframe,
        intervals: list[tuple[int, int]],
        inflight_key: str = "",
    ) -> None:
        try:
            for start, end in intervals:
                job = DownloadJob(
                    job_id=str(uuid.uuid4())[:8],
                    symbol=symbol.symbol,
                    timeframe=timeframe.freq,
                    asset_class=symbol.asset_class.value,
                    start=start,
                    end=end,
                )
                self.dataset_registry.set_status(dataset_id_for(symbol.symbol, timeframe), DownloadJobState.DOWNLOADING.value)
                self._emit("download.started", job.as_dict())
                try:
                    self._run_interval(job, symbol, timeframe)
                    self._emit("download.completed", job.as_dict())
                except Exception as exc:
                    job.error = str(exc)
                    job.transition(DownloadJobState.FAILED)
                    self.dataset_registry.set_status(dataset_id_for(symbol.symbol, timeframe), DownloadJobState.FAILED.value)
                    self._emit("download.failed", job.as_dict())
                    logger.exception("download interval failed %s", job.job_id)

            # dataset.updated (per successful save) is the reload signal;
            # a terminal ready event here re-triggered request loops.
        finally:
            if inflight_key:
                self._inflight.discard(inflight_key)

    # -- workers -----------------------------------------------------

    #: Consecutive empty/failing results before a provider is benched for
    #: the rest of the session (e.g. freeserv.dukascopy geo-blocked).
    PROVIDER_BREAKER_THRESHOLD = 3

    def _breaker_open(self, provider_name: str) -> bool:
        return self._provider_health.get(provider_name, 0) >= self.PROVIDER_BREAKER_THRESHOLD

    def _record_provider_success(self, provider_name: str) -> None:
        self._provider_health[provider_name] = 0

    def _record_provider_failure(self, provider_name: str) -> None:
        prev = self._provider_health.get(provider_name, 0)
        if prev < self.PROVIDER_BREAKER_THRESHOLD:
            self._provider_health[provider_name] = prev + 1
        if prev + 1 == self.PROVIDER_BREAKER_THRESHOLD:
            logger.warning(
                "Provider %s disabled for this session after %d consecutive empty/failed fetches",
                provider_name,
                self.PROVIDER_BREAKER_THRESHOLD,
            )

    def _mark_closed(
        self, symbol: Symbol, timeframe: Timeframe, start_s: int, end_s: int
    ) -> None:
        """Record a market-closure stretch as covered (no candles exist)."""
        self.dataset_registry.add_coverage(
            dataset_id_for(symbol.symbol, timeframe),
            int(start_s),
            int(end_s),
            "closed-market",
        )

    @staticmethod
    def _closure_stretch(ts_s: int) -> tuple[int, int] | None:
        """Closure [Fri 20:00Z, Mon 00:00Z] containing ts, or None."""
        d = datetime.fromtimestamp(int(ts_s), UTC)
        days_since_friday = (d.weekday() - 4) % 7
        fri = (d - timedelta(days=days_since_friday)).replace(
            hour=20, minute=0, second=0, microsecond=0
        )
        if fri > d:
            fri -= timedelta(days=7)
        mon = fri + timedelta(days=2, hours=4)
        start_i, end_i = int(fri.timestamp()), int(mon.timestamp())
        if start_i <= ts_s < end_i:
            return start_i, end_i
        return None

    def _trim_closed_edges(
        self, asset_class: AssetClass | str, start_s: int, end_s: int
    ) -> tuple[tuple[int, int], list[tuple[int, int]]] | tuple[None, list[tuple[int, int]]]:
        """Shrink ``[start,end]`` to its tradable span.

        Returns ``(tradable_span, closed_pieces)`` where ``closed_pieces``
        are closure stretches trimmed off the edges (callers book them as
        covered without network calls), or ``(None, pieces)`` when the whole
        window is closed.
        """
        start_s, end_s = int(start_s), int(end_s)
        if isinstance(asset_class, str):
            try:
                asset_class = AssetClass(asset_class)
            except ValueError:
                return (start_s, end_s), []
        if asset_class == AssetClass.CRYPTO or end_s < start_s:
            return (start_s, end_s), []

        pieces: list[tuple[int, int]] = []
        cursor = start_s

        # Advance the start past any closure stretch it lands inside.
        while cursor < end_s:
            stretch = self._closure_stretch(cursor)
            if stretch is None:
                break
            if stretch[1] <= end_s:
                pieces.append(stretch)
                cursor = stretch[1]
            else:
                # Remainder of the window is entirely inside this closure.
                return None, [*pieces, (cursor, end_s)]

        if cursor >= end_s:
            return None, pieces

        # Pull the end back out of a closure stretch it extends into.
        end_stretch = self._closure_stretch(end_s - 1)
        if end_stretch is not None and end_s > end_stretch[0]:
            if end_stretch[0] >= cursor:
                pieces.append((end_stretch[0], end_s))
                end_s = end_stretch[0]
            else:
                return None, pieces

        if cursor >= end_s:
            return None, pieces
        return (cursor, end_s), pieces

    def _run_interval(self, job: DownloadJob, symbol: Symbol, timeframe: Timeframe) -> None:
        # Skip network work for market closures up front: fully-closed
        # windows can never yield candles, and closed edges only pollute
        # coverage extents with unfillable holes.
        tradable, closed_pieces = self._trim_closed_edges(symbol.asset_class, job.start, job.end)
        if tradable is None or is_sub_bar_interval(timeframe, tradable[0], tradable[1]):
            logger.debug(
                "interval %s [%s..%s] is fully inside a market closure or sub-bar; marking covered",
                job.job_id,
                job.start,
                job.end,
            )
            self._mark_closed(symbol, timeframe, job.start, job.end)
            return
        t_start, t_end = tradable
        for piece_start, piece_end in closed_pieces:
            self._mark_closed(symbol, timeframe, piece_start, piece_end)

        candidates = [
            p
            for p in self.providers.candidates_for(symbol, timeframe, t_start, t_end)
            if not self._breaker_open(p.name)
        ]
        if not candidates:
            if self.providers.candidates_for(symbol, timeframe, t_start, t_end):
                raise DownloadError(
                    f"All providers are circuit-broken for {symbol.symbol}@{timeframe.freq}"
                )
            raise DownloadError(f"No enabled provider supports {symbol.symbol}@{timeframe.freq}")

        last_error: Exception | None = None
        downloaded: pl.DataFrame | None = None
        empty_providers: list[str] = []

        for provider in candidates:
            job.provider = provider.name
            limiter = self._limiter(provider.name)

            def download_once(prov=provider, lim_inst=limiter) -> pl.DataFrame:
                with lim_inst.acquire():
                    return prov.download(
                        symbol, timeframe, t_start, t_end, self._progress(job, prov)
                    )

            job.attempts = 1
            try:
                result = with_retries(
                    download_once,
                    attempts=3,
                    exceptions=(
                        DataProviderError,
                        ProviderUnavailableError,
                        ConnectionError,
                        TimeoutError,
                    ),
                    on_retry=self._on_retry(job),
                )
                if result is not None and result.height > 0:
                    downloaded = result
                    self._record_provider_success(provider.name)
                    # Providers that returned 0 before this successful fallback genuinely missed data
                    for dead_p in empty_providers:
                        self._record_provider_failure(dead_p)
                    break
                logger.debug(
                    "Provider %s returned 0 candles for %s, trying fallback candidates...",
                    provider.name,
                    job.job_id,
                )
                empty_providers.append(provider.name)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                logger.warning(
                    "Provider %s failed for %s (%s), trying fallback candidates...",
                    provider.name,
                    job.job_id,
                    exc,
                )
                self._record_provider_failure(provider.name)

        if downloaded is None or downloaded.height == 0:
            now = int(time.time())
            live_edge_buffer = max(timeframe.seconds * 2, 300)
            if job.end >= now - live_edge_buffer:
                logger.debug(
                    "Live edge for %s@%s reached [%d..%d]; marking covered",
                    symbol.symbol,
                    timeframe.freq,
                    job.start,
                    job.end,
                )
                self._mark_closed(symbol, timeframe, job.start, job.end)
                job.transition(DownloadJobState.COMPLETED)
                self.dataset_registry.set_status(dataset_id_for(symbol.symbol, timeframe), "READY")
                return

            err_msg = str(last_error) if last_error else "returned no candles"
            raise DownloadError(
                f"All providers ({[p.name for p in candidates]}) failed for {job.job_id}: {err_msg}"
            )

        job.rows_downloaded = downloaded.height
        job.transition(DownloadJobState.PROCESSING)
        self._emit(
            "download.progress",
            job.as_dict() | {"percent": 90.0, "rows": job.rows_downloaded},
        )

        normalized = normalize(downloaded)
        clean, report = validate(normalized.frame)
        if report.status.value == "invalid":
            raise ValidationError(
                f"Dataset rejected: {report.quarantined_rows}/{report.total_rows} rows invalid"
            )

        gaps = detect_gaps(clean, timeframe, symbol.asset_class)
        if gaps.suspicious:
            self._emit(
                "dataset.invalid",
                {
                    "dataset_id": dataset_id_for(symbol.symbol, timeframe),
                    "symbol": symbol.symbol,
                    "timeframe": timeframe.freq,
                    "suspicious_gaps": len(gaps.suspicious),
                    "message": f"{len(gaps.suspicious)} suspicious gaps recorded",
                },
            )

        job.transition(DownloadJobState.SAVING)
        self._emit("download.progress", job.as_dict() | {"percent": 95.0, "rows": clean.height})

        # Record only the extent we ACTUALLY have data for (clipped to the
        # requested window). Recording the requested range blindly marked
        # truncated/partial downloads as fully covered, so the holes could
        # never be re-fetched.
        if clean.height > 0:
            actual_min, actual_max = clean.select(
                pl.col("timestamp").min().alias("__mn"),
                pl.col("timestamp").max().alias("__mx"),
            ).row(0)
            coverage_start = max(int(job.start), int(actual_min))
            coverage_end = min(int(job.end), int(actual_max))
        else:
            coverage_start, coverage_end = job.start, job.end

        stored = self.dataset_store.save_dataset(
            symbol=symbol,
            timeframe=timeframe,
            asset_class=symbol.asset_class,
            provider=job.provider or "",
            frame=clean,
            exchange=symbol.exchange,
            timezone=symbol.timezone,
            interval_start=coverage_start,
            interval_end=coverage_end,
        )
        job.transition(DownloadJobState.COMPLETED)
        self.dataset_registry.set_status(dataset_id_for(symbol.symbol, timeframe), "READY")
        self._emit("dataset.updated", {"dataset_id": stored.dataset_id, **stored.to_dict()})

    # -- helpers -----------------------------------------------------

    def _coverage_window(
        self, symbol: Symbol, timeframe: Timeframe, start_s: int | None, end_s: int | None
    ) -> tuple[int, int]:
        now = int(time.time())
        if start_s is None or end_s is None:
            candidates = self.providers.candidates_for(symbol, timeframe)
            if not candidates:
                raise DatasetCoverageError(f"No provider supports {symbol.symbol}@{timeframe.freq}")
            known: tuple[int, int] | None = None
            for provider in candidates:
                known = provider.available_range(symbol, timeframe)
                if known:
                    break
            if known is None:
                day = 24 * 3600
                span = 30 * day if timeframe.is_intraday else 5 * 365 * day
                known = (now - span, now)
            # Fill in only the bound that is actually missing; previously a
            # single missing bound discarded the one the caller supplied.
            if start_s is not None:
                known = (int(start_s), known[1])
            if end_s is not None:
                known = (known[0], int(end_s))
            start_s, end_s = known
        return int(start_s), int(end_s)

    def _limiter(self, provider_name: str) -> RateLimiter:
        if provider_name not in self._limiters:
            self._limiters[provider_name] = RateLimiter(
                min_interval_ms=self._min_request_interval_ms, max_concurrency=1
            )
        return self._limiters[provider_name]

    def _progress(self, job: DownloadJob, provider: DataProvider) -> Callable[[float, str], None]:
        def on_progress(fraction: float, message: str) -> None:
            self._emit(
                "download.progress",
                {
                    **job.as_dict(),
                    "percent": round(fraction * 100, 1),
                    "message": message,
                    "provider": provider.name,
                },
            )

        return on_progress

    def _on_retry(self, job: DownloadJob) -> Callable[[int, float, Exception], None]:
        def on_retry(attempt: int, delay: float, exc: Exception) -> None:
            job.transition(DownloadJobState.RETRYING)
            job.attempts = attempt + 1
            job.error = str(exc)
            self._emit(
                "download.progress",
                {
                    **job.as_dict(),
                    "percent": 0.0,
                    "message": f"retry {attempt} in {delay:.1f}s: {exc}",
                },
            )

        return on_retry

    def _spawn(self, target: Callable[..., None], args: tuple) -> None:
        def runner() -> None:
            try:
                target(*args)
            except Exception:
                logger.exception("download worker crashed")
            finally:
                self._threads.discard(threading.current_thread())

        thread = threading.Thread(target=runner, name="download-worker", daemon=True)
        self._threads.add(thread)
        thread.start()

    def wait(self, timeout: float = 10.0) -> None:
        """Wait for all active background threads to finish."""
        threads = list(self._threads)
        for t in threads:
            t.join(timeout=timeout)