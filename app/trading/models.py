"""
Trade Simulation Data Models (Architecture §70–71 / Phase 10).
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Order:
    order_id: str
    symbol: str
    side: str  # "BUY" or "SELL"
    order_type: str  # "MARKET", "LIMIT", "STOP"
    quantity: float
    price: float = 0.0
    stop_loss: float | None = None
    take_profit: float | None = None
    trailing_stop_pips: float | None = None
    status: str = "PENDING"  # "PENDING", "FILLED", "CANCELLED", "REJECTED"
    created_at: float = field(default_factory=time.time)
    filled_at: float | None = None
    filled_price: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "order_id": self.order_id,
            "symbol": self.symbol,
            "side": self.side,
            "order_type": self.order_type,
            "quantity": self.quantity,
            "price": self.price,
            "stop_loss": self.stop_loss,
            "take_profit": self.take_profit,
            "trailing_stop_pips": self.trailing_stop_pips,
            "status": self.status,
            "created_at": self.created_at,
            "filled_at": self.filled_at,
            "filled_price": self.filled_price,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Order":
        return cls(
            order_id=data.get("order_id") or f"ord_{uuid.uuid4().hex[:8]}",
            symbol=data.get("symbol", ""),
            side=data.get("side", "BUY").upper(),
            order_type=data.get("order_type", "MARKET").upper(),
            quantity=float(data.get("quantity", 1.0)),
            price=float(data.get("price", 0.0)),
            stop_loss=float(data["stop_loss"]) if data.get("stop_loss") is not None else None,
            take_profit=float(data["take_profit"]) if data.get("take_profit") is not None else None,
            trailing_stop_pips=float(data["trailing_stop_pips"]) if data.get("trailing_stop_pips") is not None else None,
            status=data.get("status", "PENDING"),
            created_at=float(data.get("created_at", time.time())),
            filled_at=float(data["filled_at"]) if data.get("filled_at") is not None else None,
            filled_price=float(data["filled_price"]) if data.get("filled_price") is not None else None,
        )


def get_symbol_contract_details(symbol: str, price: float = 0.0) -> tuple[float, float]:
    """Return (contract_size, pip_size) matching the frontend risk calculator contract specifications."""
    sym = symbol.upper().replace("=X", "").replace("-USD", "").replace("/", "")
    if "XAU" in sym or "GOLD" in sym:
        return 100.0, 0.01
    if "XAG" in sym or "SILVER" in sym:
        return 5000.0, 0.001
    if "BTC" in sym or "ETH" in sym:
        return 1.0, 1.0
    if "JPY" in sym:
        return 100_000.0, 0.01
    if len(sym) == 6 and sym.isalpha():
        return 100_000.0, 0.0001
    if price > 1000.0:
        return 1.0, 1.0
    return 1.0, 0.01 if price > 50.0 else 0.0001


def get_pip_size(symbol: str, price: float = 0.0) -> float:
    _, pip_size = get_symbol_contract_details(symbol, price)
    return pip_size


def get_contract_multiplier(symbol: str, quantity: float = 1.0, price: float = 0.0) -> float:
    contract_size, _ = get_symbol_contract_details(symbol, price)
    return contract_size


@dataclass
class Position:
    position_id: str
    symbol: str
    side: str  # "LONG" or "SHORT"
    quantity: float
    entry_price: float
    current_price: float
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    stop_loss: float | None = None
    take_profit: float | None = None
    trailing_stop_pips: float | None = None
    highest_price: float = 0.0
    lowest_price: float = 0.0
    opened_at: float = field(default_factory=time.time)
    closed_at: float | None = None
    status: str = "OPEN"  # "OPEN", "CLOSED"

    def update_pnl(
        self,
        market_price: float,
        pip_size: float | None = None,
        high_price: float | None = None,
        low_price: float | None = None,
    ) -> None:
        self.current_price = market_price
        contract_size, def_pip = get_symbol_contract_details(self.symbol, self.entry_price)
        eff_pip_size = pip_size if pip_size is not None else def_pip
        multiplier = contract_size
        price_diff = (market_price - self.entry_price) if self.side == "LONG" else (self.entry_price - market_price)
        self.unrealized_pnl = price_diff * self.quantity * multiplier

        if self.side == "LONG":
            peak = max(market_price, high_price) if high_price is not None else market_price
            if peak > self.highest_price or self.highest_price == 0.0:
                self.highest_price = peak
            if self.trailing_stop_pips and self.trailing_stop_pips > 0:
                new_sl = self.highest_price - (self.trailing_stop_pips * eff_pip_size)
                if self.stop_loss is None or new_sl > self.stop_loss:
                    self.stop_loss = new_sl
        else:  # SHORT
            trough = min(market_price, low_price) if low_price is not None else market_price
            if trough < self.lowest_price or self.lowest_price == 0.0:
                self.lowest_price = trough
            if self.trailing_stop_pips and self.trailing_stop_pips > 0:
                new_sl = self.lowest_price + (self.trailing_stop_pips * eff_pip_size)
                if self.stop_loss is None or new_sl < self.stop_loss:
                    self.stop_loss = new_sl

    def to_dict(self) -> dict[str, Any]:
        pip_size = get_pip_size(self.symbol, self.entry_price)
        price_diff = (self.current_price - self.entry_price) if self.side == "LONG" else (self.entry_price - self.current_price)
        pips = (price_diff / pip_size) if pip_size > 0 else 0.0
        return {
            "position_id": self.position_id,
            "symbol": self.symbol,
            "side": self.side,
            "quantity": self.quantity,
            "lot_size": self.quantity,
            "entry_price": self.entry_price,
            "current_price": self.current_price,
            "unrealized_pnl": round(self.unrealized_pnl, 2),
            "pips": round(pips, 1),
            "realized_pnl": round(self.realized_pnl, 2),
            "stop_loss": self.stop_loss,
            "take_profit": self.take_profit,
            "trailing_stop_pips": self.trailing_stop_pips,
            "opened_at": self.opened_at,
            "closed_at": self.closed_at,
            "status": self.status,
        }


@dataclass
class AccountSummary:
    balance: float = 10000.0
    equity: float = 10000.0
    margin_used: float = 0.0
    free_margin: float = 10000.0
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0

    def update_totals(self) -> None:
        self.equity = round(self.balance + self.unrealized_pnl, 2)
        self.free_margin = round(self.equity - self.margin_used, 2)
        if self.total_trades > 0:
            self.win_rate = round((self.winning_trades / self.total_trades) * 100.0, 1)
        else:
            self.win_rate = 0.0

    def to_dict(self) -> dict[str, Any]:
        self.update_totals()
        return {
            "balance": round(self.balance, 2),
            "equity": round(self.equity, 2),
            "margin_used": round(self.margin_used, 2),
            "free_margin": round(self.free_margin, 2),
            "unrealized_pnl": round(self.unrealized_pnl, 2),
            "realized_pnl": round(self.realized_pnl, 2),
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "win_rate": self.win_rate,
        }
