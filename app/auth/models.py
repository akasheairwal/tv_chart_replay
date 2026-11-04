"""
Data models for user accounts, authentication sessions, and user statistics.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class User:
    """Represents a registered user in the system."""

    id: str
    username: str
    email: str
    password_hash: str
    salt: str
    initial_balance: float = 10000.0
    balance: float = 10000.0
    created_at: str = ""
    last_login_at: str | None = None

    def to_dict(self, include_sensitive: bool = False) -> dict[str, Any]:
        """Converts user to dictionary, omitting credentials by default."""
        data: dict[str, Any] = {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "initial_balance": round(self.initial_balance, 2),
            "balance": round(self.balance, 2),
            "created_at": self.created_at,
            "last_login_at": self.last_login_at,
        }
        if include_sensitive:
            data["password_hash"] = self.password_hash
            data["salt"] = self.salt
        return data


@dataclass(frozen=True)
class UserSession:
    """Represents an active authenticated bearer session."""

    token: str
    user_id: str
    created_at: str
    expires_at: int

    def is_expired(self, current_time: int | None = None) -> bool:
        """Checks if session has passed its expiration epoch timestamp."""
        now = current_time if current_time is not None else int(time.time())
        return now >= self.expires_at

    def to_dict(self) -> dict[str, Any]:
        return {
            "token": self.token,
            "user_id": self.user_id,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
        }


@dataclass(frozen=True)
class UserTradingStats:
    """Aggregated trading performance statistics for a user."""

    user_id: str
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    break_even_trades: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    profit_factor: float = 0.0
    gross_profit: float = 0.0
    gross_loss: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "user_id": self.user_id,
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "break_even_trades": self.break_even_trades,
            "win_rate": round(self.win_rate, 2),
            "total_pnl": round(self.total_pnl, 2),
            "profit_factor": round(self.profit_factor, 2),
            "gross_profit": round(self.gross_profit, 2),
            "gross_loss": round(self.gross_loss, 2),
        }

