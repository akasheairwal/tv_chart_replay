"""
Unit tests for RingBufferLogHandler and log bridge commands (Wave 8).
"""

import logging

from app.utils.logging import RingBufferLogHandler


def test_ring_buffer_log_handler():
    handler = RingBufferLogHandler(max_capacity=5)
    logger = logging.getLogger("test_logger")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    logger.info("Info message 1")
    logger.warning("Warn message 2")
    logger.error("Error message 3")

    logs = handler.get_logs("INFO")
    assert len(logs) == 3
    assert logs[0]["message"] == "Info message 1"
    assert logs[1]["level"] == "WARNING"
    assert logs[2]["level"] == "ERROR"

    warn_logs = handler.get_logs("WARN")
    assert len(warn_logs) == 2

    handler.clear()
    assert len(handler.get_logs("INFO")) == 0
