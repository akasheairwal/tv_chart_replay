"""
Structured Ring-Buffer Log Handler for live UI log viewer (Architecture §76).
"""

import logging
import time
from collections import deque
from typing import Any

MAX_LOG_ENTRIES = 500


class RingBufferLogHandler(logging.Handler):
    """Stores recent log records in memory for UI log viewer inspection."""

    def __init__(self, max_capacity: int = MAX_LOG_ENTRIES):
        super().__init__()
        self.records: deque[dict[str, Any]] = deque(maxlen=max_capacity)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            entry = {
                "timestamp": record.created,
                "formatted_time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(record.created)),
                "level": record.levelname,
                "name": record.name,
                "message": msg,
            }
            self.records.append(entry)
        except Exception:
            self.handleError(record)

    def get_logs(self, min_level: str = "INFO") -> list[dict[str, Any]]:
        level_no = getattr(logging, min_level.upper(), logging.INFO)
        result = []
        for rec in list(self.records):
            rec_level_no = getattr(logging, rec["level"], logging.INFO)
            if rec_level_no >= level_no:
                result.append(rec)
        return result

    def clear(self) -> None:
        self.records.clear()


# Global ring buffer log handler
ring_handler = RingBufferLogHandler()
ring_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
logging.getLogger().addHandler(ring_handler)
logging.getLogger().setLevel(logging.INFO)
