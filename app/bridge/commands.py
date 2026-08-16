"""Explicit bridge command surface (whitelist).

Only ``@Slot``-decorated methods are invokable from TypeScript, which is
the security boundary required by the architecture (``#61``/``#77``): no
``eval``, no arbitrary method exposure, no arbitrary filesystem access.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any, TypeVar

from PySide6.QtCore import QObject, Signal, Slot

from app.bridge.events import json_default, serialize_payload

logger = logging.getLogger(__name__)

T = TypeVar("T")


class BridgeCommandHandler(QObject):
    """The single QWebChannel object registered as ``bridge``.

    Exposed names use ``camelCase`` to match the TypeScript bridge
    contract (e.g. ``searchSymbols``, ``requestDataset``).  Wave-1 data
    services are attached through :meth:`attach_services`.
    """

    eventEmitted = Signal(str, str)  # (event_name, json_payload)

    def __init__(self, app_version: str = "") -> None:
        super().__init__()
        self._app_version = app_version
        self._services: Any = None
        self.ping_count = 0
        self._last_ping_message: str | None = None

    def attach_services(self, services: Any) -> None:
        """Attach the Wave-1 application context (registries/store/manager)."""
        self._services = services

    # -- system -----------------------------------------------------

    @Slot(result=str)
    def systemVersion(self) -> str:  # camelCase: bridge contract name
        return self._app_version

    @Slot(str, result=str)
    def systemPing(self, message: str) -> str:  # camelCase: bridge contract name
        self.ping_count += 1
        self._last_ping_message = message
        logger.debug("bridge.ping message=%r", message)
        return f"pong:{message}"

    @Slot(str)
    def systemLog(self, message: str) -> None:  # camelCase: bridge contract name
        logger.info("js.log message=%s", message)

    # -- Wave 1: data commands ---------------------------------------
    # JSON-argument commands keep the QWebChannel slot surface simple and
    # explicit; results use the {ok, data|error} envelope.

    @Slot(str, result=str)
    def searchSymbols(self, query: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            q = json.loads(query) if query.startswith('"') else query
            results = self._services.symbol_registry.search(q, limit=20)
            return [r.as_dict() for r in results]

        return self._envelope(action)

    @Slot(str, result=str)
    def requestDataset(self, request_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            request = json.loads(request_json)
            symbol = self._resolve_symbol(str(request.get("symbol", "")).upper())
            timeframe = self._resolve_timeframe(request.get("timeframe", "1H"))
            return self._services.download_manager.request_dataset(
                symbol,
                timeframe,
                start_s=request.get("start_s"),
                end_s=request.get("end_s"),
            )

        return self._envelope(action)

    @Slot(str, result=str)
    def loadHistory(self, request_json: str) -> str:  # camelCase: bridge contract name
        from app.data.models.candle import CANONICAL_COLUMNS

        def action() -> Any:
            request = json.loads(request_json)
            symbol = self._resolve_symbol(str(request.get("symbol", "")).upper())
            timeframe = self._resolve_timeframe(request.get("timeframe", "1H"))
            frame = self._services.dataset_store.load_range(
                symbol,
                timeframe,
                start_s=request.get("start_s"),
                end_s=request.get("end_s"),
            )
            limit = request.get("limit")
            if limit is not None:
                frame = frame.tail(int(limit))
            rows = [list(r) for r in frame.iter_rows()]
            return {"columns": CANONICAL_COLUMNS, "count": len(rows), "rows": rows}

        return self._envelope(action)

    # -- Wave 3: replay commands -------------------------------------

    @Slot(str, result=str)
    def createReplay(self, request_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            request = json.loads(request_json)
            symbol = self._resolve_symbol(str(request.get("symbol", "")).upper())
            timeframe = self._resolve_timeframe(request.get("timeframe", "1H"))
            frame = self._services.dataset_store.load_range(
                symbol,
                timeframe,
                start_s=request.get("start_s"),
                end_s=request.get("end_s"),
            )
            if frame.height == 0:
                self._services.download_manager.request_dataset(symbol, timeframe)
                raise ValueError(f"No historical candles found locally for {symbol.symbol}@{timeframe.freq}. Download requested from provider.")

            state = self._services.replay_engine.create_replay(
                symbol=symbol,
                timeframe=timeframe,
                frame=frame,
                start_index=request.get("start_index"),
                start_s=request.get("start_s"),
                end_s=request.get("end_s"),
                warmup_candles=int(request.get("warmup_candles", 100)),
                speed=float(request.get("speed", 1.0)),
            )
            visible = self._services.replay_engine.visible_candles()
            return {"state": state.to_dict(), "candles": visible}

        return self._envelope(action)

    @Slot(str, result=str)
    def createRandomReplay(self, request_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            request = json.loads(request_json)
            symbol = self._resolve_symbol(str(request.get("symbol", "")).upper())
            timeframe = self._resolve_timeframe(request.get("timeframe", "1H"))
            frame = self._services.dataset_store.load_range(symbol, timeframe)
            if frame.height == 0:
                self._services.download_manager.request_dataset(symbol, timeframe)
                raise ValueError(f"No historical candles found locally for {symbol.symbol}@{timeframe.freq}. Download requested from provider.")

            state = self._services.replay_engine.create_random_replay(
                symbol=symbol,
                timeframe=timeframe,
                frame=frame,
                warmup_candles=int(request.get("warmup_candles", 250)),
                replay_length=int(request.get("replay_length", 500)),
                speed=float(request.get("speed", 1.0)),
            )
            visible = self._services.replay_engine.visible_candles()
            return {"state": state.to_dict(), "candles": visible}

        return self._envelope(action)

    @Slot(str, result=str)
    @Slot(result=str)
    def playReplay(self, payload_json: str = "") -> str:  # camelCase: bridge contract name
        def action() -> Any:
            state = self._services.replay_engine.play()
            return state.to_dict()

        return self._envelope(action)

    @Slot(str, result=str)
    @Slot(result=str)
    def pauseReplay(self, payload_json: str = "") -> str:  # camelCase: bridge contract name
        def action() -> Any:
            state = self._services.replay_engine.pause()
            return state.to_dict() if state is not None else {}

        return self._envelope(action)

    @Slot(str, result=str)
    def replayNext(self, step_json: str = "1") -> str:  # camelCase: bridge contract name
        def action() -> Any:
            try:
                val = json.loads(step_json) if step_json.startswith('"') else step_json
                step = int(val)
            except (ValueError, TypeError, json.JSONDecodeError):
                step = 1
            state, new_candles = self._services.replay_engine.step_forward(step)
            return {"state": state.to_dict(), "candles": new_candles}

        return self._envelope(action)

    @Slot(str, result=str)
    def replayPrevious(self, step_json: str = "1") -> str:  # camelCase: bridge contract name
        def action() -> Any:
            try:
                val = json.loads(step_json) if step_json.startswith('"') else step_json
                step = int(val)
            except (ValueError, TypeError, json.JSONDecodeError):
                step = 1
            state, visible = self._services.replay_engine.step_backward(step)
            return {"state": state.to_dict(), "candles": visible}

        return self._envelope(action)

    @Slot(str, result=str)
    def replayJumpTo(self, target_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            val = json.loads(target_json) if target_json.startswith('"') else target_json
            target = int(val)
            state, visible = self._services.replay_engine.jump_to(target)
            return {"state": state.to_dict(), "candles": visible}

        return self._envelope(action)

    @Slot(str, result=str)
    @Slot(result=str)
    def replayReset(self, payload_json: str = "") -> str:  # camelCase: bridge contract name
        def action() -> Any:
            state, visible = self._services.replay_engine.reset()
            return {"state": state.to_dict(), "candles": visible}

        return self._envelope(action)

    @Slot(str, result=str)
    def setReplaySpeed(self, speed_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            try:
                val = json.loads(speed_json) if speed_json.startswith('"') else speed_json
            except (ValueError, TypeError, json.JSONDecodeError):
                val = speed_json
            speed = float(val)
            state = self._services.replay_engine.set_speed(speed)
            return state.to_dict()

        return self._envelope(action)

    # -- Wave 4: indicator commands ----------------------------------

    @Slot(str, result=str)
    @Slot(result=str)
    def getIndicatorCatalog(self, payload_json: str = "") -> str:  # camelCase: bridge contract name
        def action() -> Any:
            return self._services.indicator_engine.get_catalog()

        return self._envelope(action)

    @Slot(str, result=str)
    def calculateIndicator(self, request_json: str) -> str:  # camelCase: bridge contract name
        import polars as pl

        from app.data.models.candle import CANONICAL_COLUMNS

        def action() -> Any:
            request = json.loads(request_json)
            indicator_name = str(request.get("indicator_name", "")).lower()
            params = request.get("params")

            # Check if active replay session exists for this calculation
            if self._services.replay_engine.is_active:
                rows = self._services.replay_engine.visible_candles()
                if not rows:
                    frame = pl.DataFrame(schema=[(c, pl.Float64) if c != "timestamp" else (c, pl.Int64) for c in CANONICAL_COLUMNS])
                else:
                    frame = pl.DataFrame(rows, schema=[(c, pl.Float64) if c != "timestamp" else (c, pl.Int64) for c in CANONICAL_COLUMNS], orient="row")
            else:
                sym_raw = str(request.get("symbol", "")).upper() or "EURUSD"
                symbol = self._resolve_symbol(sym_raw)
                timeframe = self._resolve_timeframe(request.get("timeframe", "1H"))
                frame = self._services.dataset_store.load_range(
                    symbol,
                    timeframe,
                    start_s=request.get("start_s"),
                    end_s=request.get("end_s"),
                )

            return self._services.indicator_engine.calculate(
                indicator_name,
                frame,
                params=params,
            )

        return self._envelope(action)

    # -- Wave 5: drawing commands ------------------------------------

    @Slot(str, result=str)
    def saveDrawing(self, drawing_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            drawing = json.loads(drawing_json)
            drawing_id = str(drawing.get("id"))
            symbol = str(drawing.get("symbol", "")).upper()
            timeframe = str(drawing.get("timeframe", "1H"))
            drawing_type = str(drawing.get("type", "trend_line"))

            self._services.drawing_registry.save_drawing(
                symbol=symbol,
                timeframe=timeframe,
                drawing_id=drawing_id,
                drawing_type=drawing_type,
                definition=drawing,
            )
            self.emit("drawing.saved", {"id": drawing_id, "symbol": symbol, "timeframe": timeframe})
            return {"id": drawing_id}

        return self._envelope(action)

    @Slot(str, result=str)
    def loadDrawings(self, request_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            request = json.loads(request_json)
            symbol = str(request.get("symbol", "")).upper()
            timeframe = str(request.get("timeframe", "1H"))
            drawings = self._services.drawing_registry.load_drawings(symbol, timeframe)
            return {"symbol": symbol, "timeframe": timeframe, "drawings": drawings}

        return self._envelope(action)

    @Slot(str, result=str)
    def deleteDrawing(self, id_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            drawing_id = json.loads(id_json) if id_json.startswith('"') else id_json
            deleted = self._services.drawing_registry.delete_drawing(str(drawing_id))
            if deleted:
                self.emit("drawing.deleted", {"id": drawing_id})
            return {"deleted": deleted, "id": drawing_id}

        return self._envelope(action)

    @Slot(str, result=str)
    def clearDrawings(self, request_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            request = json.loads(request_json)
            symbol = str(request.get("symbol", "")).upper()
            timeframe = str(request.get("timeframe", "1H"))
            count = self._services.drawing_registry.clear_drawings(symbol, timeframe)
            return {"cleared": count, "symbol": symbol, "timeframe": timeframe}

        return self._envelope(action)

    # -- Wave 7: session commands ------------------------------------

    @Slot(str, result=str)
    def saveSession(self, session_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            from app.sessions.models import SessionDefinition

            data = json.loads(session_json)
            session = SessionDefinition.from_dict(data)
            saved_id = self._services.session_manager.save_session(session)
            self.emit(
                "session.saved",
                {
                    "id": saved_id,
                    "name": session.name,
                    "symbol": session.symbol,
                    "timeframe": session.timeframe,
                    "is_autosave": session.is_autosave,
                },
            )
            return {"id": saved_id, "name": session.name}

        return self._envelope(action)

    @Slot(str, result=str)
    def loadSession(self, id_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            session_id = id_json.strip('"')
            session = self._services.session_manager.load_session(session_id)
            if session is None:
                raise ValueError(f"Session not found: {session_id!r}")

            version_check = self._services.session_manager.check_dataset_version_match(session)
            session_dict = session.to_dict()
            session_dict["dataset_check"] = version_check

            self.emit(
                "session.loaded",
                {
                    "id": session.id,
                    "name": session.name,
                    "symbol": session.symbol,
                    "timeframe": session.timeframe,
                    "dataset_check": version_check,
                },
            )
            return session_dict

        return self._envelope(action)

    @Slot(result=str)
    def listSessions(self) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            from dataclasses import asdict

            summaries = self._services.session_manager.list_sessions(include_autosave=False)
            return [asdict(s) for s in summaries]

        return self._envelope(action)

    @Slot(str, result=str)
    def deleteSession(self, id_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            session_id = id_json.strip('"')
            deleted = self._services.session_manager.delete_session(session_id)
            if deleted:
                self.emit("session.deleted", {"id": session_id})
            return {"deleted": deleted, "id": session_id}

        return self._envelope(action)

    @Slot(str, result=str)
    def saveAutosave(self, session_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            from app.sessions.models import SessionDefinition

            data = json.loads(session_json)
            session = SessionDefinition.from_dict(data)
            saved_id = self._services.session_manager.save_autosave(session)
            return {"id": saved_id, "is_autosave": True}

        return self._envelope(action)

    @Slot(result=str)
    def loadAutosave(self) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            session = self._services.session_manager.get_latest_autosave()
            if session is None:
                return None

            version_check = self._services.session_manager.check_dataset_version_match(session)
            session_dict = session.to_dict()
            session_dict["dataset_check"] = version_check
            return session_dict

        return self._envelope(action)

    # -- Wave 8: watchlist commands ----------------------------------

    # -- Wave 8: watchlist commands ----------------------------------

    @Slot(str, result=str)
    @Slot(result=str)
    def getWatchlist(self, payload_json: str = "") -> str:  # camelCase: bridge contract name
        def action() -> Any:
            if self._services is not None and hasattr(self._services, "watchlist_manager"):
                items = self._services.watchlist_manager.get_watchlist()
                if items:
                    return [item.to_dict() for item in items]
            if self._services is not None and hasattr(self._services, "symbol_registry"):
                favorites = self._services.symbol_registry.favorites()
                return [f.as_dict() for f in favorites]
            return []

        return self._envelope(action)

    @Slot(str, result=str)
    def toggleWatchlist(self, symbol_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            symbol = str(json.loads(symbol_json) if symbol_json.startswith('"') else symbol_json).upper()
            if self._services is not None and hasattr(self._services, "watchlist_manager"):
                is_fav = self._services.watchlist_manager.toggle_favorite(symbol)
                return {"symbol": symbol, "is_favorite": is_fav}
            if self._services is not None and hasattr(self._services, "symbol_registry"):
                is_fav = self._services.symbol_registry.toggle_favorite(symbol)
                return {"symbol": symbol, "is_favorite": is_fav}
            return {"symbol": symbol, "is_favorite": False}

        return self._envelope(action)

    @Slot(str, result=str)
    def setWatchlist(self, request_json: str) -> str:  # camelCase: bridge contract name
        def action() -> Any:
            request = json.loads(request_json)
            symbols = [str(s).upper() for s in request.get("symbols", [])]
            if self._services is not None and hasattr(self._services, "symbol_registry"):
                for sym in self._services.symbol_registry.all():
                    is_fav = sym.symbol in symbols
                    self._services.symbol_registry._repo.set_favorite(sym.symbol, is_fav)
            return {"updated": len(symbols)}

        return self._envelope(action)

    @Slot(str, result=str)
    def addWatchlistItem(self, payload_json: str) -> str:
        def action():
            if self._services is None or not hasattr(self._services, "watchlist_manager"):
                raise RuntimeError("watchlist service unavailable")
            data = json.loads(payload_json)
            sym = data.get("symbol", "")
            disp = data.get("display_name", sym)
            kind = data.get("asset_type", "forex")
            item = self._services.watchlist_manager.add_item(sym, disp, kind)
            return item.to_dict()

        return self._envelope(action)

    @Slot(str, result=str)
    def removeWatchlistItem(self, symbol: str) -> str:
        def action():
            if self._services is None or not hasattr(self._services, "watchlist_manager"):
                raise RuntimeError("watchlist service unavailable")
            sym_clean = json.loads(symbol) if symbol.startswith('"') else symbol
            deleted = self._services.watchlist_manager.remove_item(sym_clean)
            return {"symbol": sym_clean, "deleted": deleted}

        return self._envelope(action)

    @Slot(str, result=str)
    def toggleFavoriteWatchlist(self, symbol: str) -> str:
        def action():
            if self._services is None or not hasattr(self._services, "watchlist_manager"):
                raise RuntimeError("watchlist service unavailable")
            sym_clean = json.loads(symbol) if symbol.startswith('"') else symbol
            is_fav = self._services.watchlist_manager.toggle_favorite(sym_clean)
            return {"symbol": sym_clean, "is_favorite": is_fav}

        return self._envelope(action)

    # -- logs & resilience (Wave 8) ----------------------------------

    @Slot(str, result=str)
    def getLogs(self, min_level: str) -> str:
        def action():
            from app.utils.logging import ring_handler
            level = json.loads(min_level) if min_level.startswith('"') else min_level
            return ring_handler.get_logs(level or "INFO")

        return self._envelope(action)

    @Slot(str, result=str)
    @Slot(result=str)
    def clearLogs(self, payload_json: str = "") -> str:
        def action():
            from app.utils.logging import ring_handler
            ring_handler.clear()
            return {"cleared": True}

        return self._envelope(action)

    # -- trading simulation (Wave 9) ---------------------------------

    @Slot(str, result=str)
    def placeOrder(self, payload_json: str) -> str:
        def action():
            if self._services is None or not hasattr(self._services, "order_engine"):
                raise RuntimeError("order engine unavailable")
            data = json.loads(payload_json)
            mkt_price = float(data.get("current_market_price", 0.0))
            if mkt_price <= 0:
                engine = getattr(self._services, "replay_engine", None) or getattr(self._services, "replay_controller", None)
                if engine:
                    try:
                        state = engine.get_state() if hasattr(engine, "get_state") else None
                        if state:
                            cand = getattr(state, "current_candle", None) or (state.get("current_candle") if isinstance(state, dict) else None)
                            if cand and isinstance(cand, (list, tuple)) and len(cand) >= 5:
                                mkt_price = float(cand[4])
                            elif cand and isinstance(cand, dict):
                                mkt_price = float(cand.get("close", 0.0))
                    except (AttributeError, KeyError, IndexError, ValueError, TypeError):
                        pass

            sl_raw = data.get("stop_loss")
            clean_sl = float(sl_raw) if sl_raw is not None and str(sl_raw).strip() and float(sl_raw) > 0 else None

            tp_raw = data.get("take_profit")
            clean_tp = float(tp_raw) if tp_raw is not None and str(tp_raw).strip() and float(tp_raw) > 0 else None

            order = self._services.order_engine.place_order(
                symbol=data.get("symbol", ""),
                side=data.get("side", "BUY"),
                order_type=data.get("order_type", "MARKET"),
                quantity=float(data.get("quantity", 1.0)),
                price=float(data.get("price", 0.0)),
                stop_loss=clean_sl,
                take_profit=clean_tp,
                trailing_stop_pips=data.get("trailing_stop_pips"),
                current_market_price=mkt_price,
                timestamp=float(data.get("timestamp", 0.0)),
            )
            return order.to_dict()

        return self._envelope(action)

    @Slot(str, result=str)
    def cancelOrder(self, order_id: str) -> str:
        def action():
            if self._services is None or not hasattr(self._services, "order_engine"):
                raise RuntimeError("order engine unavailable")
            oid = json.loads(order_id) if order_id.startswith('"') else order_id
            ok = self._services.order_engine.cancel_order(oid)
            return {"order_id": oid, "cancelled": ok}

        return self._envelope(action)

    @Slot(str, float, str, result=str)
    @Slot(str, float, result=str)
    @Slot(str, result=str)
    def closePosition(self, position_id_or_payload: str, current_price: float = 0.0, reason: str = "MANUAL") -> str:
        def action():
            if self._services is None or not hasattr(self._services, "order_engine"):
                raise RuntimeError("order engine unavailable")
            close_qty = None
            if position_id_or_payload.startswith("{"):
                data = json.loads(position_id_or_payload)
                pid = data.get("position_id", "")
                price = float(data.get("current_price", 0.0))
                rsn = data.get("reason", "MANUAL")
                if "close_quantity" in data and data["close_quantity"] is not None:
                    close_qty = float(data["close_quantity"])
            else:
                pid = json.loads(position_id_or_payload) if position_id_or_payload.startswith('"') else position_id_or_payload
                price = float(current_price)
                rsn = reason
            record = self._services.order_engine.close_position(pid, price, rsn, close_qty)
            return record or {}

        return self._envelope(action)

    @Slot(str, result=str)
    def modifyPosition(self, payload_json: str) -> str:
        def action():
            if self._services is None or not hasattr(self._services, "order_engine"):
                raise RuntimeError("order engine unavailable")
            data = json.loads(payload_json)
            pid = data.get("position_id", "")

            def parse_target(val):
                if val is None or str(val).strip() == "" or str(val).strip().lower() == "null":
                    return 0.0
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return 0.0

            sl_val = parse_target(data.get("stop_loss")) if "stop_loss" in data else None
            tp_val = parse_target(data.get("take_profit")) if "take_profit" in data else None

            res = self._services.order_engine.modify_position(
                position_id=pid,
                stop_loss=sl_val,
                take_profit=tp_val,
            )
            return res or {}

        return self._envelope(action)

    @Slot(str, result=str)
    @Slot(result=str)
    def getAccountSummary(self, payload_json: str = "") -> str:
        def action():
            if self._services is None or not hasattr(self._services, "order_engine"):
                return {}
            return self._services.order_engine.get_account_summary()

        return self._envelope(action)

    @Slot(str, result=str)
    @Slot(result=str)
    def getOpenPositions(self, payload_json: str = "") -> str:
        def action():
            if self._services is None or not hasattr(self._services, "order_engine"):
                return []
            return self._services.order_engine.get_open_positions()

        return self._envelope(action)

    @Slot(str, result=str)
    @Slot(result=str)
    def getPendingOrders(self, payload_json: str = "") -> str:
        def action():
            if self._services is None or not hasattr(self._services, "order_engine"):
                return []
            return self._services.order_engine.get_pending_orders()

        return self._envelope(action)

    @Slot(str, result=str)
    @Slot(result=str)
    def getTradeJournal(self, payload_json: str = "") -> str:
        def action():
            if self._services is None or not hasattr(self._services, "trade_journal"):
                return []
            return self._services.trade_journal.get_trades()

        return self._envelope(action)

    @Slot(str, result=str)
    @Slot(float, result=str)
    @Slot(result=str)
    def resetAccount(self, initial_balance_or_json: Any = 10000.0) -> str:
        def action():
            if self._services is None or not hasattr(self._services, "order_engine"):
                raise RuntimeError("order engine unavailable")
            balance = 10000.0
            if isinstance(initial_balance_or_json, (int, float)):
                balance = float(initial_balance_or_json)
            elif isinstance(initial_balance_or_json, str) and initial_balance_or_json:
                try:
                    parsed = json.loads(initial_balance_or_json)
                    if isinstance(parsed, (int, float)):
                        balance = float(parsed)
                    elif isinstance(parsed, dict):
                        balance = float(parsed.get("initial_balance", 10000.0))
                except (ValueError, TypeError, json.JSONDecodeError):
                    pass
            summary = self._services.order_engine.reset_account(balance)
            return summary.to_dict()

        return self._envelope(action)

    # -- events (Python -> TypeScript) ------------------------------

    def emit(self, event: str, payload: dict[str, Any] | None = None) -> None:
        """Emit a structured event to the TypeScript side."""
        self.eventEmitted.emit(event, serialize_payload(payload))

    # -- helpers -----------------------------------------------------

    def _envelope(self, fn: Callable[[], T]) -> str:
        """Run ``fn`` and return the ``{ok, data|error}`` JSON envelope."""
        try:
            return json.dumps(
                {"ok": True, "data": fn()},
                separators=(",", ":"),
                default=json_default,
            )
        except Exception as exc:
            logger.exception("bridge command failed")
            return json.dumps({"ok": False, "error": str(exc)}, separators=(",", ":"))

    def _resolve_symbol(self, symbol_text: str):
        from app.data.models.symbol import AssetClass, Symbol

        if self._services is None:
            raise RuntimeError("data services not attached")
        symbol = self._services.symbol_registry.get(symbol_text)
        if symbol is None:
            from app.data.providers.catalog import provider_candidates_for

            candidates = provider_candidates_for(symbol_text)
            if not candidates:
                raise ValueError(f"Unknown symbol: {symbol_text!r} - not in catalog")
            kind = (
                AssetClass.CRYPTO
                if "USDT" in symbol_text or symbol_text.startswith("BTC")
                else AssetClass.STOCK
            )
            symbol = Symbol(
                symbol=symbol_text,
                display_name=symbol_text,
                asset_class=kind,
                exchange="",
                provider_candidates=candidates,
            )
        return symbol

    @staticmethod
    def _resolve_timeframe(freq: str):
        from app.data.models.timeframe import Timeframe

        return Timeframe.parse(freq)

    # -- introspection (tests) --------------------------------------

    @property
    def last_ping_message(self) -> str | None:
        return self._last_ping_message

    @property
    def services(self) -> Any:
        return self._services
