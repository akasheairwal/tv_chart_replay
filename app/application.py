"""Application context: wires data services for the bridge (Wave 1)."""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass

logger = logging.getLogger(__name__)

from PySide6.QtCore import QObject, Signal

from app.bridge.events import serialize_payload
from app.config.paths import Paths, get_paths
from app.config.settings import AppSettings, get_settings
from app.data.downloader.manager import DownloadManager
from app.data.providers.base import DataProvider
from app.data.providers.binance import BinanceProvider
from app.data.providers.dukascopy import DukascopyProvider
from app.data.providers.registry import ProviderRegistry
from app.data.providers.yahoo import YahooProvider
from app.data.registry.dataset_registry import DatasetRegistry
from app.data.registry.drawing_registry import DrawingRegistry
from app.data.registry.symbol_registry import SymbolRegistry
from app.data.storage.dataset_store import DatasetStore
from app.database.connection import connect
from app.indicators.engine import IndicatorEngine
from app.replay.engine import ReplayEngine
from app.sessions.manager import SessionManager
from app.trading.journal import TradeJournal
from app.trading.order_engine import OrderEngine
from app.watchlist.manager import WatchlistManager


class BridgeEventRelay(QObject):
    """Thread-safe Python -> JS event relay.

    Emitted from download worker threads; Qt queues delivery to the main
    thread where the QWebChannel transport lives.
    """

    eventEmitted = Signal(str, str)  # (event_name, json_payload)

    def emit_event(self, name: str, payload: dict) -> None:
        self.eventEmitted.emit(name, serialize_payload(payload))


@dataclass
class ApplicationContext:
    settings: AppSettings
    paths: Paths
    conn: sqlite3.Connection
    symbol_registry: SymbolRegistry
    dataset_registry: DatasetRegistry
    dataset_store: DatasetStore
    drawing_registry: DrawingRegistry
    session_manager: SessionManager
    watchlist_manager: WatchlistManager
    trade_journal: TradeJournal
    order_engine: OrderEngine
    provider_registry: ProviderRegistry
    download_manager: DownloadManager
    replay_engine: ReplayEngine
    indicator_engine: IndicatorEngine
    event_relay: BridgeEventRelay
    providers: list[DataProvider]

    def close(self) -> None:
        self.replay_engine.pause()
        self.download_manager.wait()
        try:
            self.watchlist_manager.close()
        except sqlite3.Error as exc:
            logger.debug("Error closing watchlist manager: %s", exc)
        try:
            self.trade_journal.close()
        except sqlite3.Error as exc:
            logger.debug("Error closing trade journal: %s", exc)
        self.conn.close()


def build_context(
    settings: AppSettings | None = None, *, paths: Paths | None = None
) -> ApplicationContext:
    """Build the fully-wired service graph for this process."""
    settings = settings or get_settings()
    paths = paths or get_paths().ensure()

    conn = connect(paths.database_path)
    symbol_registry = SymbolRegistry(conn)
    dataset_registry = DatasetRegistry(conn)
    drawing_registry = DrawingRegistry(conn)
    session_manager = SessionManager(
        conn=conn,
        sessions_dir=paths.sessions_dir,
        dataset_registry=dataset_registry,
    )
    watchlist_manager = WatchlistManager(paths.database_path)
    trade_journal = TradeJournal(paths.database_path)
    event_relay = BridgeEventRelay()
    order_engine = OrderEngine(trade_journal, emit=event_relay.emit_event)

    providers: list[DataProvider] = [DukascopyProvider(), YahooProvider(), BinanceProvider()]
    provider_registry = ProviderRegistry(providers)

    dataset_store = DatasetStore(paths, dataset_registry)
    download_manager = DownloadManager(
        provider_registry,
        dataset_registry,
        dataset_store,
        emit=event_relay.emit_event,
        min_request_interval_ms=250.0,
    )
    replay_engine = ReplayEngine(
        emit=event_relay.emit_event,
        on_tick=order_engine.on_replay_tick,
    )
    indicator_engine = IndicatorEngine()

    return ApplicationContext(
        settings=settings,
        paths=paths,
        conn=conn,
        symbol_registry=symbol_registry,
        dataset_registry=dataset_registry,
        dataset_store=dataset_store,
        drawing_registry=drawing_registry,
        session_manager=session_manager,
        watchlist_manager=watchlist_manager,
        trade_journal=trade_journal,
        order_engine=order_engine,
        provider_registry=provider_registry,
        download_manager=download_manager,
        replay_engine=replay_engine,
        indicator_engine=indicator_engine,
        event_relay=event_relay,
        providers=providers,
    )
