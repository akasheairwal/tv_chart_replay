"""Structured bridge events (Python -> TypeScript).

Event payloads are always JSON-serializable dicts.  The shared contract
lives in ``docs/bridge-contract.md``.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any


def json_default(obj: Any) -> Any:
    """JSON encoder fallback for bridge payloads."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Path):
        return str(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def serialize_payload(payload: dict[str, Any] | None = None) -> str:
    """Serialize an event payload to compact JSON."""
    return json.dumps(payload or {}, separators=(",", ":"), default=json_default)
