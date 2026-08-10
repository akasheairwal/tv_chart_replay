"""
Watchlist data models.
"""

from dataclasses import dataclass
from typing import Any


@dataclass
class WatchlistItem:
    symbol: str
    display_name: str
    asset_type: str = "forex"  # forex, crypto, stock, index
    is_favorite: bool = False
    added_at: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "display_name": self.display_name,
            "asset_type": self.asset_type,
            "is_favorite": self.is_favorite,
            "added_at": self.added_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "WatchlistItem":
        return cls(
            symbol=data.get("symbol", ""),
            display_name=data.get("display_name", data.get("symbol", "")),
            asset_type=data.get("asset_type", "forex"),
            is_favorite=bool(data.get("is_favorite", False)),
            added_at=float(data.get("added_at", 0.0)),
        )
