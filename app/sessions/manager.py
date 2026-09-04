"""SQLite & File storage manager for Replay Sessions (Architecture ``#53``/``#54``/``#55``)."""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from app.data.registry.dataset_registry import DatasetRegistry
from app.sessions.models import SessionDefinition, SessionSummary

logger = logging.getLogger(__name__)


class SessionManager:
    """Thread-safe manager for saving, loading, listing, and autosaving replay sessions."""

    def __init__(
        self,
        conn: sqlite3.Connection,
        sessions_dir: Path | None = None,
        dataset_registry: DatasetRegistry | None = None,
    ) -> None:
        self._conn = conn
        self._sessions_dir = sessions_dir
        self._dataset_registry = dataset_registry
        self._lock = threading.RLock()
        self._ensure_schema()

    def _safe_session_path(self, session_id: str) -> Path | None:
        """Resolve a safe session JSON file path within _sessions_dir, preventing directory traversal."""
        if not self._sessions_dir:
            return None
        clean_name = Path(session_id).name
        if not clean_name or clean_name in (".", ".."):
            return None
        target = (self._sessions_dir / f"{clean_name}.json").resolve()
        try:
            if not target.is_relative_to(self._sessions_dir.resolve()):
                return None
        except ValueError:
            return None
        return target

    def _ensure_schema(self) -> None:
        with self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    timeframe TEXT NOT NULL,
                    dataset_id TEXT,
                    dataset_version TEXT,
                    is_autosave INTEGER DEFAULT 0,
                    definition_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
                """
            )
            self._conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_sessions_updated
                ON sessions(updated_at DESC)
                """
            )
            self._conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_sessions_autosave
                ON sessions(is_autosave, updated_at DESC)
                """
            )
            self._conn.commit()

    def save_session(self, session: SessionDefinition) -> str:
        """Save or update a replay session in SQLite and file backup."""
        with self._lock:
            now = int(time.time())
            session.updated_at = now
            if not session.created_at:
                session.created_at = now

            def_json = json.dumps(session.to_dict(), separators=(",", ":"))

            self._conn.execute(
                """
                INSERT INTO sessions (
                    id, name, symbol, timeframe, dataset_id, dataset_version,
                    is_autosave, definition_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    symbol = excluded.symbol,
                    timeframe = excluded.timeframe,
                    dataset_id = excluded.dataset_id,
                    dataset_version = excluded.dataset_version,
                    is_autosave = excluded.is_autosave,
                    definition_json = excluded.definition_json,
                    updated_at = excluded.updated_at
                """,
                (
                    session.id,
                    session.name,
                    session.symbol.upper(),
                    session.timeframe,
                    session.dataset_id,
                    session.dataset_version,
                    1 if session.is_autosave else 0,
                    def_json,
                    session.created_at,
                    session.updated_at,
                ),
            )
            self._conn.commit()

            # Backup to filesystem JSON file if directory configured
            file_path = self._safe_session_path(session.id)
            if file_path:
                try:
                    file_path.parent.mkdir(parents=True, exist_ok=True)
                    tmp_path = file_path.with_suffix(".json.tmp")
                    tmp_path.write_text(def_json, encoding="utf-8")
                    tmp_path.replace(file_path)
                except OSError as exc:
                    logger.debug("failed to backup session to filesystem: %s", exc)

            return session.id

    def load_session(self, session_id: str) -> SessionDefinition | None:
        """Load a session by its ID from SQLite (or filesystem fallback)."""
        with self._lock:
            cursor = self._conn.execute(
                "SELECT definition_json FROM sessions WHERE id = ?",
                (session_id,),
            )
            row = cursor.fetchone()
            if row:
                try:
                    data = json.loads(row[0])
                    return SessionDefinition.from_dict(data)
                except (json.JSONDecodeError, TypeError, KeyError) as exc:
                    logger.debug("corrupt session JSON in database: %s", exc)

            # Fallback to filesystem JSON file
            file_path = self._safe_session_path(session_id)
            if file_path and file_path.is_file():
                try:
                    data = json.loads(file_path.read_text(encoding="utf-8"))
                    return SessionDefinition.from_dict(data)
                except (OSError, json.JSONDecodeError, TypeError, KeyError) as exc:
                    logger.debug("corrupt session JSON on filesystem: %s", exc)

            return None

    def list_sessions(self, include_autosave = False) -> list[SessionSummary]:
        """List session summaries sorted by most recently updated."""
        with self._lock:
            query = """
                SELECT id, name, symbol, timeframe, updated_at, is_autosave, dataset_version, definition_json
                FROM sessions
            """
            params: list[Any] = []
            if not include_autosave:
                query += " WHERE is_autosave = 0"
            query += " ORDER BY updated_at DESC"

            cursor = self._conn.execute(query, params)
            rows = cursor.fetchall()
            summaries: list[SessionSummary] = []

            for row in rows:
                sid, name, symbol, timeframe, updated_at, is_autosave, dataset_version, def_json = row
                draw_count = 0
                ind_count = 0
                try:
                    parsed = json.loads(def_json)
                    draw_count = len(parsed.get("drawings", []))
                    ind_count = len(parsed.get("indicators", []))
                except (json.JSONDecodeError, TypeError) as exc:
                    logger.debug("corrupt session JSON in list_sessions: %s", exc)

                summaries.append(
                    SessionSummary(
                        id=sid,
                        name=name,
                        symbol=symbol,
                        timeframe=timeframe,
                        updated_at=updated_at,
                        drawing_count=draw_count,
                        indicator_count=ind_count,
                        is_autosave=bool(is_autosave),
                        dataset_version=dataset_version,
                    )
                )

            return summaries

    def delete_session(self, session_id: str) -> bool:
        """Delete a session from SQLite and filesystem."""
        with self._lock:
            cursor = self._conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            self._conn.commit()
            deleted = cursor.rowcount > 0

            file_path = self._safe_session_path(session_id)
            if file_path and file_path.is_file():
                try:
                    file_path.unlink()
                except OSError as exc:
                    logger.debug("failed to unlink session file: %s", exc)

            return deleted

    def save_autosave(self, session: SessionDefinition) -> str:
        """Save a dedicated autosave recovery snapshot."""
        # Work on a copy: mutating the caller's object (id / is_autosave /
        # name) made any later re-save of the same instance silently
        # overwrite the autosave row instead of creating a normal session.
        snapshot = SessionDefinition.from_dict(session.to_dict())
        snapshot.is_autosave = True
        snapshot.id = "autosave_latest"
        snapshot.name = f"Autosave: {snapshot.symbol} {snapshot.timeframe}"
        return self.save_session(snapshot)

    def get_latest_autosave(self) -> SessionDefinition | None:
        """Retrieve the latest autosave session if available."""
        return self.load_session("autosave_latest")

    def check_dataset_version_match(self, session: SessionDefinition) -> dict[str, Any]:
        """Check if session's dataset exists and whether version matches (§55)."""
        if not self._dataset_registry or not session.symbol or not session.timeframe:
            return {"status": "unknown", "match": True}

        info = self._dataset_registry.info(session.symbol, session.timeframe)
        if info is None:
            return {
                "status": "missing",
                "match": False,
                "expected_version": session.dataset_version,
                "current_version": None,
                "message": f"Dataset for {session.symbol} {session.timeframe} is missing locally.",
            }

        # The session stores the dataset's stable identity (dataset_id) as
        # its version marker; compare like-for-like strings.
        current_ver = str(info.dataset_id)
        stored_ver = str(session.dataset_version) if session.dataset_version else None
        if stored_ver and stored_ver != current_ver:
            return {
                "status": "mismatch",
                "match": False,
                "expected_version": session.dataset_version,
                "current_version": current_ver,
                "message": (
                    f"Dataset version drift detected: session references '{session.dataset_version}', "
                    f"current is '{current_ver}'."
                ),
            }

        return {
            "status": "ready",
            "match": True,
            "current_version": current_ver,
        }
