"""
Order Engine — paper trading order execution & risk manager (Architecture §70–71 / ADR 0011).
Supports multi-user scoping, ephemeral demo paper trading, real-time margin accounting,
and institutional force liquidation (stop-out) with negative balance protection.
"""

from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Callable
from typing import Any

from app.trading.journal import TradeJournal
from app.trading.models import (
    AccountSummary,
    Order,
    Position,
    calculate_required_margin,
    get_contract_multiplier,
    get_default_leverage,
    get_pip_size,
)


def _resolve_target_price(
    val: float | None,
    exec_price: float,
    pip_size: float,
    side: str,
    *,
    is_take_profit: bool,
) -> float | None:
    if val is None:
        return None
    val_float = float(val)
    if val_float <= 0:
        return None
    if exec_price > 0:
        is_abs = (val_float >= exec_price * 0.1) if exec_price >= 50 else (abs(val_float - exec_price) < exec_price * 0.5)
    else:
        is_abs = True
    if is_abs:
        return round(val_float, 5)
    if is_take_profit:
        target = exec_price + (val_float * pip_size) if side == "BUY" else exec_price - (val_float * pip_size)
    else:
        target = exec_price - (val_float * pip_size) if side == "BUY" else exec_price + (val_float * pip_size)
    return round(target, 5)


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
        self._demo_account = AccountSummary(balance=initial_balance, equity=initial_balance, free_margin=initial_balance)
        self.commission_per_trade = commission_per_trade
        self.emit = emit
        self.orders: dict[str, Order] = {}
        self.positions: dict[str, Position] = {}
        self._demo_trades: list[dict[str, Any]] = []
        self._latest_prices: dict[str, float] = {}
        self._current_replay_timestamp: float = 0.0
        self._lock = threading.Lock()

    def _recalculate_account_metrics(self) -> None:
        """Recalculate margin_used, unrealized_pnl, equity, free_margin, and margin_level for both accounts."""
        # 1. Live account
        live_open = [p for p in self.positions.values() if p.status == "OPEN" and not p.is_demo]
        self.account.margin_used = round(sum(p.required_margin for p in live_open), 2)
        self.account.unrealized_pnl = round(sum(p.unrealized_pnl for p in live_open), 2)
        self.account.update_totals()

        # 2. Demo account
        demo_open = [p for p in self.positions.values() if p.status == "OPEN" and p.is_demo]
        self._demo_account.margin_used = round(sum(p.required_margin for p in demo_open), 2)
        self._demo_account.unrealized_pnl = round(sum(p.unrealized_pnl for p in demo_open), 2)
        self._demo_account.update_totals()

    def reset_account(
        self,
        initial_balance: float = 10000.0,
        user_id: str | None = None,
        is_demo: bool = False,
        clear_journal: bool = False,
    ) -> AccountSummary:
        with self._lock:
            init_bal = float(initial_balance)
            if is_demo:
                prev_trades = self._demo_account.total_trades if not clear_journal else 0
                prev_winning = self._demo_account.winning_trades if not clear_journal else 0
                prev_losing = self._demo_account.losing_trades if not clear_journal else 0
                prev_realized = self._demo_account.realized_pnl if not clear_journal else 0.0
                self._demo_account = AccountSummary(
                    balance=init_bal,
                    equity=init_bal,
                    free_margin=init_bal,
                    margin_used=0.0,
                    margin_level=0.0,
                    total_trades=prev_trades,
                    winning_trades=prev_winning,
                    losing_trades=prev_losing,
                    realized_pnl=prev_realized,
                )
                self.orders = {k: v for k, v in self.orders.items() if not v.is_demo}
                self.positions = {k: v for k, v in self.positions.items() if not v.is_demo}
                self._demo_trades.clear()
                self._recalculate_account_metrics()
                res = self._demo_account
            elif user_id is not None:
                prev_trades = self.account.total_trades if not clear_journal else 0
                prev_winning = self.account.winning_trades if not clear_journal else 0
                prev_losing = self.account.losing_trades if not clear_journal else 0
                prev_realized = self.account.realized_pnl if not clear_journal else 0.0
                self.account = AccountSummary(
                    balance=init_bal,
                    equity=init_bal,
                    free_margin=init_bal,
                    margin_used=0.0,
                    margin_level=0.0,
                    total_trades=prev_trades,
                    winning_trades=prev_winning,
                    losing_trades=prev_losing,
                    realized_pnl=prev_realized,
                )
                self.orders = {k: v for k, v in self.orders.items() if v.user_id != user_id}
                self.positions = {k: v for k, v in self.positions.items() if v.user_id != user_id}
                if clear_journal:
                    self.journal.clear(user_id=user_id)
                self._recalculate_account_metrics()
                res = self.account
            else:
                prev_trades = self.account.total_trades if not clear_journal else 0
                prev_winning = self.account.winning_trades if not clear_journal else 0
                prev_losing = self.account.losing_trades if not clear_journal else 0
                prev_realized = self.account.realized_pnl if not clear_journal else 0.0
                self.account = AccountSummary(
                    balance=init_bal,
                    equity=init_bal,
                    free_margin=init_bal,
                    margin_used=0.0,
                    margin_level=0.0,
                    total_trades=prev_trades,
                    winning_trades=prev_winning,
                    losing_trades=prev_losing,
                    realized_pnl=prev_realized,
                )
                self.orders.clear()
                self.positions.clear()
                self._demo_trades.clear()
                self._latest_prices.clear()
                self._current_replay_timestamp = 0.0
                if clear_journal:
                    self.journal.clear()
                self._recalculate_account_metrics()
                res = self.account

        if self.emit:
            self.emit("trading.account", self.get_account_summary(is_demo=is_demo))
            self.emit("trading.positions", self.get_open_positions(is_demo=is_demo))
        return res

    def add_balance(
        self,
        amount: float,
        user_id: str | None = None,
        is_demo: bool = False,
        note: str = "",
    ) -> AccountSummary:
        """Add funds to the paper trading account balance (deposit simulation)."""
        with self._lock:
            amount_float = float(amount)
            if amount_float <= 0:
                raise ValueError("Deposit amount must be positive")
            if is_demo:
                self._demo_account.balance = round(self._demo_account.balance + amount_float, 2)
                self._recalculate_account_metrics()
                res = self._demo_account
            else:
                self.account.balance = round(self.account.balance + amount_float, 2)
                self._recalculate_account_metrics()
                res = self.account

        if self.emit:
            self.emit("trading.account", self.get_account_summary(is_demo=is_demo))
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
        user_id: str = "local_default",
        is_demo: bool = False,
        leverage: float | None = None,
        enforce_margin: bool = False,
    ) -> Order:
        order_id = f"ord_{uuid.uuid4().hex[:8]}"
        side_clean = side.upper()
        type_clean = order_type.upper()
        sym_clean = symbol.upper()

        exec_price = current_market_price if current_market_price > 0 else self._latest_prices.get(sym_clean, price)
        pip_size = get_pip_size(sym_clean, exec_price)

        clean_sl = _resolve_target_price(stop_loss, exec_price, pip_size, side_clean, is_take_profit=False)
        clean_tp = _resolve_target_price(take_profit, exec_price, pip_size, side_clean, is_take_profit=True)

        exec_timestamp = timestamp if timestamp > 0 else (self._current_replay_timestamp if self._current_replay_timestamp > 0 else time.time())
        eff_leverage = leverage if (leverage is not None and leverage > 0) else get_default_leverage(sym_clean)
        req_margin = calculate_required_margin(sym_clean, quantity, exec_price if exec_price > 0 else price, eff_leverage)

        target_account = self._demo_account if is_demo else self.account

        # Pre-trade margin check if explicitly requested
        if enforce_margin and target_account.free_margin < req_margin:
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
                status="REJECTED",
                created_at=exec_timestamp,
                user_id=user_id,
                is_demo=is_demo,
                leverage=eff_leverage,
                required_margin=req_margin,
            )
            return order

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
            user_id=user_id,
            is_demo=is_demo,
            leverage=eff_leverage,
            required_margin=req_margin,
        )

        with self._lock:
            self.orders[order_id] = order
            if type_clean == "MARKET" and exec_price > 0:
                self._execute_order(order, exec_price, exec_timestamp)

        if self.emit:
            self.emit("trading.account", self.get_account_summary(is_demo=is_demo))
            self.emit("trading.positions", self.get_open_positions(is_demo=is_demo))
            self.emit("trading.orders", self.get_pending_orders(is_demo=is_demo))

        return order

    def cancel_order(self, order_id: str) -> bool:
        with self._lock:
            order = self.orders.get(order_id)
            if order and order.status == "PENDING":
                order.status = "CANCELLED"
                cancelled = True
                is_demo = order.is_demo
            else:
                cancelled = False
                is_demo = False

        if cancelled and self.emit:
            self.emit("trading.orders", self.get_pending_orders(is_demo=is_demo))
        return cancelled

    def close_position(
        self,
        position_id: str,
        current_price: float = 0.0,
        reason: str = "MANUAL",
        close_quantity: float | None = None,
    ) -> dict[str, Any] | None:
        with self._lock:
            pos = self.positions.get(position_id)
            if not pos or pos.status != "OPEN":
                return None

            exec_price = current_price if current_price > 0 else self._latest_prices.get(pos.symbol, pos.entry_price)
            is_demo = pos.is_demo
            record = self._close_position_internal(pos, exec_price, reason, close_quantity)

        if self.emit:
            self.emit("trading.account", self.get_account_summary(is_demo=is_demo))
            self.emit("trading.positions", self.get_open_positions(is_demo=is_demo))
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
            pip_size = get_pip_size(pos.symbol, exec_price)

            if stop_loss is not None:
                pos.stop_loss = _resolve_target_price(stop_loss, exec_price, pip_size, side_clean, is_take_profit=False)

            if take_profit is not None:
                pos.take_profit = _resolve_target_price(take_profit, exec_price, pip_size, side_clean, is_take_profit=True)

            res = pos.to_dict()
            is_demo = pos.is_demo

        if self.emit:
            self.emit("trading.account", self.get_account_summary(is_demo=is_demo))
            self.emit("trading.positions", self.get_open_positions(is_demo=is_demo))
            self.emit("trading.position_updated", res)

        return res

    def on_replay_tick(
        self,
        symbol: str,
        open_p: float,
        high_p: float,
        low_p: float,
        close_p: float,
        timestamp: float = 0.0,
    ) -> list[dict[str, Any]]:
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

                pos.update_pnl(close_p, high_price=high_p, low_price=low_p)

                # Skip SL/TP checks ONLY if tick timestamp is strictly before position opening timestamp
                if timestamp > 0 and pos.opened_at > 0 and timestamp < pos.opened_at:
                    continue

                # Check SL (only if valid positive SL defined)
                if pos.stop_loss is not None and pos.stop_loss > 0:
                    sl_hit = (pos.side == "LONG" and low_p <= pos.stop_loss) or (pos.side == "SHORT" and high_p >= pos.stop_loss)
                    if sl_hit:
                        if pos.side == "LONG":
                            fill_price = min(pos.stop_loss, open_p) if open_p <= pos.stop_loss else pos.stop_loss
                        else:
                            fill_price = max(pos.stop_loss, open_p) if open_p >= pos.stop_loss else pos.stop_loss
                        record = self._close_position_internal(pos, fill_price, "STOP_LOSS")
                        events.append({"event": "position_closed", "reason": "STOP_LOSS", "trade": record})
                        continue

                # Check TP (only if valid positive TP defined)
                if pos.take_profit is not None and pos.take_profit > 0:
                    tp_hit = (pos.side == "LONG" and high_p >= pos.take_profit) or (pos.side == "SHORT" and low_p <= pos.take_profit)
                    if tp_hit:
                        if pos.side == "LONG":
                            fill_price = max(pos.take_profit, open_p) if open_p >= pos.take_profit else pos.take_profit
                        else:
                            fill_price = min(pos.take_profit, open_p) if open_p <= pos.take_profit else pos.take_profit
                        record = self._close_position_internal(pos, fill_price, "TAKE_PROFIT")
                        events.append({"event": "position_closed", "reason": "TAKE_PROFIT", "trade": record})
                        continue

            # 3. Recalculate metrics for both accounts
            self._recalculate_account_metrics()

            # 4. Check Institutional Stop-Out / Force Liquidation (ADR 0011)
            self._check_force_liquidation(
                is_demo=False,
                close_p=close_p,
                high_p=high_p,
                low_p=low_p,
                timestamp=timestamp,
                events=events,
            )
            self._check_force_liquidation(
                is_demo=True,
                close_p=close_p,
                high_p=high_p,
                low_p=low_p,
                timestamp=timestamp,
                events=events,
            )

        if self.emit:
            self.emit("trading.account", self.get_account_summary(is_demo=False))
            self.emit("trading.positions", self.get_open_positions(is_demo=False))
            for ev in events:
                if ev.get("event") == "position_closed":
                    self.emit("trading.position_closed", ev.get("trade"))
                elif ev.get("event") == "order_filled":
                    self.emit("trading.order_filled", ev.get("order"))
                elif ev.get("event") == "liquidation":
                    self.emit("trading.liquidation", ev)

        return events

    def _check_force_liquidation(
        self,
        is_demo: bool,
        close_p: float,
        high_p: float,
        low_p: float,
        timestamp: float,
        events: list[dict[str, Any]],
    ) -> None:
        """Check Stop-Out threshold (Margin Level <= 30% or Equity <= 0) and execute liquidation."""
        target_account = self._demo_account if is_demo else self.account
        open_positions = [p for p in self.positions.values() if p.status == "OPEN" and p.is_demo == is_demo]
        if not open_positions:
            return

        is_stop_out = (target_account.margin_used > 0 and target_account.margin_level <= 30.0) or target_account.equity <= 0.0

        if not is_stop_out:
            if target_account.margin_used > 0 and target_account.margin_level <= 100.0:
                events.append({
                    "event": "margin_call_warning",
                    "is_demo": is_demo,
                    "margin_level": target_account.margin_level,
                    "equity": target_account.equity,
                    "margin_used": target_account.margin_used,
                })
            return

        # Sort open positions by largest floating loss ascending (most negative first)
        sorted_positions = sorted(open_positions, key=lambda p: p.unrealized_pnl)
        liquidated_records = []

        for pos in sorted_positions:
            adverse_price = (low_p if pos.side == "LONG" else high_p) if close_p > 0 else pos.current_price
            if adverse_price <= 0:
                adverse_price = close_p if close_p > 0 else pos.current_price

            record = self._close_position_internal(pos, adverse_price, reason="FORCE_LIQUIDATION")
            liquidated_records.append(record)
            events.append({
                "event": "position_closed",
                "reason": "FORCE_LIQUIDATION",
                "trade": record,
            })

            self._recalculate_account_metrics()

            # If margin level recovered above 30% and equity > 0, stop liquidation
            if target_account.margin_used == 0 or (target_account.margin_level > 30.0 and target_account.equity > 0):
                break

        # Cancel all pending orders for this account
        for ord_id, ord_obj in list(self.orders.items()):
            if ord_obj.is_demo == is_demo and ord_obj.status == "PENDING":
                ord_obj.status = "CANCELLED"
                events.append({
                    "event": "order_cancelled",
                    "reason": "LIQUIDATION_CANCEL",
                    "order": ord_obj.to_dict(),
                })

        # Negative Balance Protection: clamp negative balance to 0.00
        if target_account.balance < 0.0:
            target_account.balance = 0.0
            self._recalculate_account_metrics()

        liq_event = {
            "event": "liquidation",
            "is_demo": is_demo,
            "reason": "STOP_OUT_30_PERCENT",
            "liquidated_positions": liquidated_records,
            "final_balance": target_account.balance,
            "final_equity": target_account.equity,
            "timestamp": timestamp or time.time(),
        }
        events.append(liq_event)
        if self.emit:
            self.emit("trading.liquidation", liq_event)

    def _execute_order(self, order: Order, fill_price: float, timestamp: float = 0.0) -> None:
        order.status = "FILLED"
        order.filled_at = timestamp if timestamp > 0 else time.time()
        order.filled_price = fill_price

        # Open Position
        pos_id = f"pos_{uuid.uuid4().hex[:8]}"
        pos_side = "LONG" if order.side == "BUY" else "SHORT"
        req_margin = calculate_required_margin(order.symbol, order.quantity, fill_price, order.leverage)
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
            user_id=order.user_id,
            is_demo=order.is_demo,
            leverage=order.leverage,
            required_margin=req_margin,
        )
        self.positions[pos_id] = pos
        self._recalculate_account_metrics()

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

        multiplier = get_contract_multiplier(pos.symbol, qty_to_close, pos.entry_price)
        if pos.side == "LONG":
            pnl = (close_price - pos.entry_price) * qty_to_close * multiplier - self.commission_per_trade
        else:
            pnl = (pos.entry_price - close_price) * qty_to_close * multiplier - self.commission_per_trade

        closed_ts = self._current_replay_timestamp if self._current_replay_timestamp > 0 else time.time()

        if is_partial:
            pos.quantity = round(pos.quantity - qty_to_close, 2)
            pos.current_price = close_price
            pos.required_margin = calculate_required_margin(pos.symbol, pos.quantity, pos.entry_price, pos.leverage)
            exit_rsn = f"PARTIAL_CLOSE ({reason})"
        else:
            pos.status = "CLOSED"
            pos.closed_at = closed_ts
            pos.current_price = close_price
            pos.realized_pnl = pnl
            pos.unrealized_pnl = 0.0
            pos.required_margin = 0.0
            exit_rsn = reason

        # Update account stats
        target_account = self._demo_account if pos.is_demo else self.account
        target_account.balance += pnl
        target_account.realized_pnl += pnl
        target_account.total_trades += 1
        if pnl > 0:
            target_account.winning_trades += 1
        elif pnl < 0:
            target_account.losing_trades += 1

        if not is_partial:
            self.positions.pop(pos.position_id, None)

        # Recalculate margin and equity totals
        self._recalculate_account_metrics()

        # Negative Balance Protection if all positions are closed and balance is negative
        open_count = len([p for p in self.positions.values() if p.status == "OPEN" and p.is_demo == pos.is_demo])
        if open_count == 0 and target_account.balance < 0.0:
            target_account.balance = 0.0
            self._recalculate_account_metrics()

        trade_id = f"{pos.position_id}_partial_{int(time.time()*1000)}" if is_partial else pos.position_id

        if pos.is_demo:
            pnl_pct = ((close_price - pos.entry_price) / pos.entry_price * 100.0) if pos.entry_price > 0 else 0.0
            if pos.side.upper() in ("SHORT", "SELL"):
                pnl_pct = -pnl_pct
            record = {
                "id": trade_id,
                "user_id": pos.user_id,
                "session_id": "demo_session",
                "symbol": pos.symbol,
                "side": pos.side,
                "quantity": qty_to_close,
                "entry_price": pos.entry_price,
                "exit_price": close_price,
                "pnl": round(pnl, 2),
                "pnl_percent": round(pnl_pct, 2),
                "commission": round(self.commission_per_trade, 2),
                "opened_at": pos.opened_at,
                "closed_at": closed_ts,
                "exit_reason": exit_rsn,
                "is_demo": True,
            }
            self._demo_trades.append(record)
        else:
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
                closed_at=closed_ts,
                exit_reason=exit_rsn,
                user_id=pos.user_id,
            )

        return record

    def get_open_positions(
        self,
        user_id: str | None = None,
        is_demo: bool | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            res = [p for p in self.positions.values() if p.status == "OPEN"]
            if user_id is not None:
                res = [p for p in res if p.user_id == user_id]
            if is_demo is not None:
                res = [p for p in res if p.is_demo == is_demo]
            return [p.to_dict() for p in res]

    def get_pending_orders(
        self,
        user_id: str | None = None,
        is_demo: bool | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            res = [o for o in self.orders.values() if o.status == "PENDING"]
            if user_id is not None:
                res = [o for o in res if o.user_id == user_id]
            if is_demo is not None:
                res = [o for o in res if o.is_demo == is_demo]
            return [o.to_dict() for o in res]

    def get_trades(
        self,
        limit: int = 100,
        user_id: str | None = None,
        is_demo: bool = False,
    ) -> list[dict[str, Any]]:
        with self._lock:
            if is_demo:
                return list(reversed(self._demo_trades))[:limit]
            return self.journal.get_trades(limit=limit, user_id=user_id)

    def get_account_summary(self, is_demo: bool = False) -> dict[str, Any]:
        with self._lock:
            self._recalculate_account_metrics()
            target_account = self._demo_account if is_demo else self.account
            return target_account.to_dict()
