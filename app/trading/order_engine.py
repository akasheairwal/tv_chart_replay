"""
Order Engine — paper trading order execution & risk manager (Architecture §70–71).
"""

import threading
import time
import uuid
from collections.abc import Callable
from typing import Any

from app.trading.journal import TradeJournal
from app.trading.models import AccountSummary, Order, Position, get_contract_multiplier


class OrderEngine:
    """Executes paper orders on replay ticks and tracks live positions and account summary."""

    def __init__(
        self,
        journal: TradeJournal,
        initial_balance: float = 10000.0,
        commission_per_trade: float = 0.0,
        emit: Callable[[str, Any], None] | None = None,
    ):
        self.journal = journal
        self.account = AccountSummary(balance=initial_balance, equity=initial_balance, free_margin=initial_balance)
        self.commission_per_trade = commission_per_trade
        self.emit = emit
        self.orders: dict[str, Order] = {}
        self.positions: dict[str, Position] = {}
        self._latest_prices: dict[str, float] = {}
        self._current_replay_timestamp: float = 0.0
        self._lock = threading.Lock()

    def reset_account(self, initial_balance: float = 10000.0) -> AccountSummary:
        with self._lock:
            self.account = AccountSummary(balance=initial_balance, equity=initial_balance, free_margin=initial_balance)
            self.orders.clear()
            self.positions.clear()
            self._latest_prices.clear()
            self._current_replay_timestamp = 0.0
            self.journal.clear()
            res = self.account

        if self.emit:
            self.emit("trading.account", self.get_account_summary())
            self.emit("trading.positions", self.get_open_positions())
        return res

    def place_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        quantity: float,
        price: float = 0.0,
        stop_loss: float | None = None,
        take_profit: float | None = None,
        trailing_stop_pips: float | None = None,
        current_market_price: float = 0.0,
        timestamp: float = 0.0,
    ) -> Order:
        order_id = f"ord_{uuid.uuid4().hex[:8]}"
        side_clean = side.upper()
        type_clean = order_type.upper()
        sym_clean = symbol.upper()

        exec_price = current_market_price if current_market_price > 0 else self._latest_prices.get(sym_clean, price)
        pip_size = 1.0 if exec_price > 1000.0 else (0.01 if (exec_price > 50.0 or "JPY" in sym_clean) else 0.0001)

        # 1. Resolve SL Target Price (absolute price vs pips distance)
        clean_sl = None
        if stop_loss is not None and float(stop_loss) > 0:
            sl_val = float(stop_loss)
            is_abs_price = abs(sl_val - exec_price) < exec_price * 0.5
            if is_abs_price:
                clean_sl = round(sl_val, 5)
            else:
                # Interpret as distance in pips
                clean_sl = round(exec_price - (sl_val * pip_size) if side_clean == "BUY" else exec_price + (sl_val * pip_size), 5)

        # 2. Resolve TP Target Price (absolute price vs pips distance)
        clean_tp = None
        if take_profit is not None and float(take_profit) > 0:
            tp_val = float(take_profit)
            is_abs_price = abs(tp_val - exec_price) < exec_price * 0.5
            if is_abs_price:
                clean_tp = round(tp_val, 5)
            else:
                # Interpret as distance in pips
                clean_tp = round(exec_price + (tp_val * pip_size) if side_clean == "BUY" else exec_price - (tp_val * pip_size), 5)

        exec_timestamp = timestamp if timestamp > 0 else (self._current_replay_timestamp if self._current_replay_timestamp > 0 else time.time())

        order = Order(
            order_id=order_id,
            symbol=sym_clean,
            side=side_clean,
            order_type=type_clean,
            quantity=quantity,
            price=price if type_clean in ("LIMIT", "STOP") else exec_price,
            stop_loss=clean_sl,
            take_profit=clean_tp,
            trailing_stop_pips=trailing_stop_pips,
            status="PENDING",
            created_at=exec_timestamp,
        )

        with self._lock:
            self.orders[order_id] = order
            if type_clean == "MARKET" and exec_price > 0:
                self._execute_order(order, exec_price, exec_timestamp)

        if self.emit:
            self.emit("trading.account", self.get_account_summary())
            self.emit("trading.positions", self.get_open_positions())
            self.emit("trading.orders", self.get_pending_orders())

        return order

    def cancel_order(self, order_id: str) -> bool:
        with self._lock:
            order = self.orders.get(order_id)
            if order and order.status == "PENDING":
                order.status = "CANCELLED"
                cancelled = True
            else:
                cancelled = False

        if cancelled and self.emit:
            self.emit("trading.orders", self.get_pending_orders())
        return cancelled

    def close_position(
        self,
        position_id: str,
        current_price: float,
        reason: str = "MANUAL",
        close_quantity: float | None = None,
    ) -> dict[str, Any] | None:
        with self._lock:
            pos = self.positions.get(position_id)
            if not pos or pos.status != "OPEN":
                return None
            record = self._close_position_internal(pos, current_price, reason, close_quantity)

        if self.emit:
            self.emit("trading.account", self.get_account_summary())
            self.emit("trading.positions", self.get_open_positions())
            if record:
                self.emit("trading.position_closed", record)
        return record

    def modify_position(
        self,
        position_id: str,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict[str, Any] | None:
        with self._lock:
            pos = self.positions.get(position_id)
            if not pos or pos.status != "OPEN":
                return None

            exec_price = pos.entry_price
            side_clean = "BUY" if str(pos.side).upper() in ("LONG", "BUY") else "SELL"
            pip_size = 1.0 if exec_price > 1000.0 else (0.01 if (exec_price > 50.0 or "JPY" in pos.symbol.upper()) else 0.0001)

            if stop_loss is not None:
                sl_val = float(stop_loss)
                if sl_val <= 0:
                    pos.stop_loss = None
                else:
                    is_abs = abs(sl_val - exec_price) < exec_price * 0.5
                    clean_sl = sl_val if is_abs else (exec_price - sl_val * pip_size if side_clean == "BUY" else exec_price + sl_val * pip_size)
                    pos.stop_loss = round(clean_sl, 5)

            if take_profit is not None:
                tp_val = float(take_profit)
                if tp_val <= 0:
                    pos.take_profit = None
                else:
                    is_abs = abs(tp_val - exec_price) < exec_price * 0.5
                    clean_tp = tp_val if is_abs else (exec_price + tp_val * pip_size if side_clean == "BUY" else exec_price - tp_val * pip_size)
                    pos.take_profit = round(clean_tp, 5)

            res = pos.to_dict()

        if self.emit:
            self.emit("trading.account", self.get_account_summary())
            self.emit("trading.positions", self.get_open_positions())
            self.emit("trading.position_updated", res)

        return res

    def on_replay_tick(self, symbol: str, open_p: float, high_p: float, low_p: float, close_p: float, timestamp: float = 0.0) -> list[dict[str, Any]]:
        """Evaluate pending orders and open positions against replay candle high/low/close prices."""
        events = []
        with self._lock:
            self._latest_prices[symbol.upper()] = close_p
            if timestamp > 0:
                self._current_replay_timestamp = timestamp

            # 1. Process pending limit/stop/market orders
            for order in list(self.orders.values()):
                if order.symbol != symbol or order.status != "PENDING":
                    continue
                fill_price = None
                if order.order_type == "MARKET":
                    fill_price = open_p if open_p > 0 else close_p
                elif order.order_type == "LIMIT":
                    if order.side == "BUY" and low_p <= order.price:
                        fill_price = min(order.price, open_p)
                    elif order.side == "SELL" and high_p >= order.price:
                        fill_price = max(order.price, open_p)
                elif order.order_type == "STOP":
                    if order.side == "BUY" and high_p >= order.price:
                        fill_price = max(order.price, open_p)
                    elif order.side == "SELL" and low_p <= order.price:
                        fill_price = min(order.price, open_p)

                if fill_price is not None:
                    self._execute_order(order, fill_price, timestamp)
                    events.append({"event": "order_filled", "order": order.to_dict()})

            # 2. Process open positions (SL / TP checks & trailing stop updates)
            for pos in list(self.positions.values()):
                if pos.symbol != symbol or pos.status != "OPEN":
                    continue

                pos.update_pnl(close_p)

                # Skip SL/TP checks ONLY if tick timestamp is strictly before position opening timestamp
                if timestamp > 0 and pos.opened_at > 0 and timestamp < pos.opened_at:
                    continue

                # Check SL (only if valid positive SL defined)
                if pos.stop_loss is not None and pos.stop_loss > 0:
                    sl_hit = (pos.side == "LONG" and low_p <= pos.stop_loss) or (pos.side == "SHORT" and high_p >= pos.stop_loss)
                    if sl_hit:
                        record = self._close_position_internal(pos, pos.stop_loss, "STOP_LOSS")
                        events.append({"event": "position_closed", "reason": "STOP_LOSS", "trade": record})
                        continue

                # Check TP (only if valid positive TP defined)
                if pos.take_profit is not None and pos.take_profit > 0:
                    tp_hit = (pos.side == "LONG" and high_p >= pos.take_profit) or (pos.side == "SHORT" and low_p <= pos.take_profit)
                    if tp_hit:
                        record = self._close_position_internal(pos, pos.take_profit, "TAKE_PROFIT")
                        events.append({"event": "position_closed", "reason": "TAKE_PROFIT", "trade": record})
                        continue

            # Update account unrealized PnL summary
            total_unrealized = sum(p.unrealized_pnl for p in self.positions.values() if p.status == "OPEN")
            self.account.unrealized_pnl = total_unrealized
            self.account.update_totals()

        if self.emit:
            self.emit("trading.account", self.get_account_summary())
            self.emit("trading.positions", self.get_open_positions())
            for ev in events:
                if ev.get("event") == "position_closed":
                    self.emit("trading.position_closed", ev.get("trade"))
                elif ev.get("event") == "order_filled":
                    self.emit("trading.order_filled", ev.get("order"))

        return events

    def _execute_order(self, order: Order, fill_price: float, timestamp: float = 0.0) -> None:
        order.status = "FILLED"
        order.filled_at = timestamp if timestamp > 0 else time.time()
        order.filled_price = fill_price

        # Open Position
        pos_id = f"pos_{uuid.uuid4().hex[:8]}"
        pos_side = "LONG" if order.side == "BUY" else "SHORT"
        pos = Position(
            position_id=pos_id,
            symbol=order.symbol,
            side=pos_side,
            quantity=order.quantity,
            entry_price=fill_price,
            current_price=fill_price,
            stop_loss=order.stop_loss,
            take_profit=order.take_profit,
            trailing_stop_pips=order.trailing_stop_pips,
            highest_price=fill_price,
            lowest_price=fill_price,
            opened_at=timestamp if timestamp > 0 else (self._current_replay_timestamp if self._current_replay_timestamp > 0 else time.time()),
        )
        self.positions[pos_id] = pos

    def _close_position_internal(
        self,
        pos: Position,
        close_price: float,
        reason: str,
        close_quantity: float | None = None,
    ) -> dict[str, Any]:
        is_partial = False
        qty_to_close = pos.quantity

        if close_quantity is not None and 0 < float(close_quantity) < pos.quantity:
            is_partial = True
            qty_to_close = round(float(close_quantity), 2)

        multiplier = get_contract_multiplier(pos.symbol, qty_to_close)
        if pos.side == "LONG":
            pnl = (close_price - pos.entry_price) * qty_to_close * multiplier - self.commission_per_trade
        else:
            pnl = (pos.entry_price - close_price) * qty_to_close * multiplier - self.commission_per_trade

        if is_partial:
            pos.quantity = round(pos.quantity - qty_to_close, 2)
            pos.current_price = close_price
            exit_rsn = f"PARTIAL_CLOSE ({reason})"
        else:
            pos.status = "CLOSED"
            pos.closed_at = time.time()
            pos.current_price = close_price
            pos.realized_pnl = pnl
            pos.unrealized_pnl = 0.0
            exit_rsn = reason

        # Update account stats
        self.account.balance += pnl
        self.account.realized_pnl += pnl
        self.account.total_trades += 1
        if pnl > 0:
            self.account.winning_trades += 1
        elif pnl < 0:
            self.account.losing_trades += 1

        self.account.update_totals()

        trade_id = f"{pos.position_id}_partial_{int(time.time()*1000)}" if is_partial else pos.position_id

        record = self.journal.record_trade(
            trade_id=trade_id,
            symbol=pos.symbol,
            side=pos.side,
            quantity=qty_to_close,
            entry_price=pos.entry_price,
            exit_price=close_price,
            pnl=pnl,
            commission=self.commission_per_trade,
            opened_at=pos.opened_at,
            closed_at=time.time(),
            exit_reason=exit_rsn,
        )

        if not is_partial:
            self.positions.pop(pos.position_id, None)

        return record

    def get_open_positions(self) -> list[dict[str, Any]]:
        with self._lock:
            return [p.to_dict() for p in self.positions.values() if p.status == "OPEN"]

    def get_pending_orders(self) -> list[dict[str, Any]]:
        with self._lock:
            return [o.to_dict() for o in self.orders.values() if o.status == "PENDING"]

    def get_account_summary(self) -> dict[str, Any]:
        with self._lock:
            total_unrealized = sum(p.unrealized_pnl for p in self.positions.values() if p.status == "OPEN")
            self.account.unrealized_pnl = total_unrealized
            return self.account.to_dict()
