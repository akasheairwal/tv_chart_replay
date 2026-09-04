"""Local symbol registry (architecture ``#8``/``#9``).

Seeded from the curated catalog; search runs over symbol / display name /
exchange / asset class.  Provider-catalog search is deferred to Wave 2.
"""
from __future__ import annotations

import json
import sqlite3
from collections.abc import Sequence

from app.data.models.symbol import AssetClass, Symbol, SymbolSearchResult
from app.data.providers.catalog import curated_catalog
from app.database.repositories import SymbolRepository


def _parse_providers(raw: object) -> list[str]:
    try:
        parsed = json.loads(raw or "[]")
        return parsed if isinstance(parsed, list) else []
    except (ValueError, TypeError):
        return []


def _row_to_symbol(row: sqlite3.Row) -> Symbol:
    return Symbol(
        symbol=row["symbol"],
        display_name=row["display_name"] or "",
        asset_class=AssetClass(row["asset_class"]),
        exchange=row["exchange"] or "",
        timezone=row["timezone"] or "UTC",
        provider_candidates=_parse_providers(row["providers"]),
    )


class SymbolRegistry:
    def __init__(
        self,
        conn: sqlite3.Connection,
        catalog: Sequence[Symbol] | None = None,
        *,
        seed: bool = True,
    ) -> None:
        self._repo = SymbolRepository(conn)
        if seed:
            for symbol in catalog if catalog is not None else curated_catalog():
                self._repo.upsert(
                    symbol.symbol,
                    symbol.asset_class.value,
                    symbol.display_name,
                    symbol.exchange,
                    symbol.timezone,
                    symbol.provider_candidates,
                )

    def search(self, query: str, limit: int = 20) -> list[SymbolSearchResult]:
        rows = self._repo.search(query, limit)
        return [
            SymbolSearchResult(
                symbol=r["symbol"],
                display_name=r["display_name"] or "",
                asset_class=r["asset_class"],
                exchange=r["exchange"] or "",
                provider_candidates=_parse_providers(r["providers"]),
            )
            for r in rows
        ]

    def get(self, symbol: str, default: Symbol | None = None) -> Symbol | None:
        row = self._repo.get(symbol.upper())
        return _row_to_symbol(row) if row is not None else default

    def set_favorite(self, symbol: str, favorite: bool) -> bool:
        """Set favorite flag; returns False when the symbol is unknown."""
        row = self._repo.get(symbol.upper())
        if row is None:
            return False
        self._repo.set_favorite(symbol.upper(), bool(favorite))
        return True

    def upsert(self, symbol: Symbol) -> None:
        self._repo.upsert(
            symbol.symbol,
            symbol.asset_class.value,
            symbol.display_name,
            symbol.exchange,
            symbol.timezone,
            symbol.provider_candidates,
        )

    register = upsert

    def all(self) -> list[Symbol]:
        return [_row_to_symbol(r) for r in self._repo.all()]

    def toggle_favorite(self, symbol: str) -> bool:
        row = self._repo.get(symbol.upper())
        if row is None:
            return False
        new_value = not bool(int(row["favorite"]))
        self._repo.set_favorite(symbol.upper(), new_value)
        return new_value

    def favorites(self) -> list[Symbol]:
        return [_row_to_symbol(r) for r in self._repo.list_favorites()]