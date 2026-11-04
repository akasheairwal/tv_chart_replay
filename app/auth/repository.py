"""
SQLite persistence repositories for Users and Authentication Sessions.
"""

from __future__ import annotations

import sqlite3
import time
from datetime import UTC, datetime

from app.auth.crypto import generate_session_token, generate_user_id
from app.auth.models import User, UserSession


def now_iso() -> str:
    """Returns current UTC time in ISO format."""
    return datetime.now(UTC).isoformat()


class UserRepository:
    """Manages user persistence, credentials, and paper balance state in SQLite."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def create_user(
        self,
        username: str,
        email: str,
        password_hash: str,
        salt: str,
        initial_balance: float = 10000.0,
        user_id: str | None = None,
    ) -> User:
        """
        Creates and persists a new user.

        Raises:
            ValueError: If username or email is already taken.
        """
        clean_username = username.strip()
        clean_email = email.strip().lower()

        if not clean_username:
            raise ValueError("Username cannot be empty")
        if not clean_email or "@" not in clean_email:
            raise ValueError("A valid email address is required")

        uid = user_id or generate_user_id()
        created_at = now_iso()

        # Check existing uniqueness first for clear error messaging
        existing_user = self.get_by_username(clean_username)
        if existing_user is not None:
            raise ValueError(f"Username '{clean_username}' is already taken")

        existing_email = self.get_by_email(clean_email)
        if existing_email is not None:
            raise ValueError(f"Email '{clean_email}' is already registered")

        self._conn.execute(
            """
            INSERT INTO users (id, username, email, password_hash, salt, initial_balance, balance, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uid,
                clean_username,
                clean_email,
                password_hash,
                salt,
                float(initial_balance),
                float(initial_balance),
                created_at,
            ),
        )
        self._conn.commit()

        return User(
            id=uid,
            username=clean_username,
            email=clean_email,
            password_hash=password_hash,
            salt=salt,
            initial_balance=float(initial_balance),
            balance=float(initial_balance),
            created_at=created_at,
            last_login_at=None,
        )

    def get_by_id(self, user_id: str) -> User | None:
        """Retrieves a user by ID."""
        cur = self._conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        return self._to_model(row) if row else None

    def get_by_username(self, username: str) -> User | None:
        """Retrieves a user by username (case-insensitive)."""
        cur = self._conn.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
            (username.strip(),),
        )
        row = cur.fetchone()
        return self._to_model(row) if row else None

    def get_by_email(self, email: str) -> User | None:
        """Retrieves a user by email (case-insensitive)."""
        cur = self._conn.execute(
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
            (email.strip().lower(),),
        )
        row = cur.fetchone()
        return self._to_model(row) if row else None

    def get_by_login(self, login: str) -> User | None:
        """Retrieves a user by either username or email."""
        clean_login = login.strip()
        cur = self._conn.execute(
            """
            SELECT * FROM users 
            WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
            LIMIT 1
            """,
            (clean_login, clean_login.lower()),
        )
        row = cur.fetchone()
        return self._to_model(row) if row else None

    def update_balance(self, user_id: str, new_balance: float) -> bool:
        """Updates user account paper trading balance."""
        cur = self._conn.execute(
            "UPDATE users SET balance = ? WHERE id = ?",
            (round(float(new_balance), 2), user_id),
        )
        self._conn.commit()
        return cur.rowcount > 0

    def reset_balance(self, user_id: str, target_balance: float | None = None) -> float:
        """
        Resets user paper trading balance.
        If target_balance is None, resets to the user's initial_balance.
        """
        user = self.get_by_id(user_id)
        if user is None:
            raise ValueError(f"User '{user_id}' not found")

        reset_val = float(target_balance if target_balance is not None else user.initial_balance)
        self._conn.execute(
            "UPDATE users SET balance = ? WHERE id = ?",
            (reset_val, user_id),
        )
        self._conn.commit()
        return reset_val

    def add_balance(self, user_id: str, amount: float) -> float:
        """Adds funds to a user's paper trading balance."""
        user = self.get_by_id(user_id)
        if user is None:
            raise ValueError(f"User '{user_id}' not found")
        amt = float(amount)
        if amt <= 0:
            raise ValueError("Deposit amount must be positive")
        new_balance = round(user.balance + amt, 2)
        self.update_balance(user_id, new_balance)
        return new_balance

    def update_last_login(self, user_id: str) -> None:
        """Updates the last_login_at timestamp to now."""
        self._conn.execute(
            "UPDATE users SET last_login_at = ? WHERE id = ?",
            (now_iso(), user_id),
        )
        self._conn.commit()

    def delete_user(self, user_id: str) -> bool:
        """Deletes user and cascades to sessions and trade records."""
        cur = self._conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        self._conn.commit()
        return cur.rowcount > 0

    def list_users(self, limit: int = 100) -> list[User]:
        """Lists users ordered by creation date."""
        cur = self._conn.execute(
            "SELECT * FROM users ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        return [self._to_model(r) for r in cur.fetchall()]

    @staticmethod
    def _to_model(row: sqlite3.Row | tuple) -> User:
        if isinstance(row, sqlite3.Row) or hasattr(row, "keys"):
            d = dict(row)
            return User(
                id=d["id"],
                username=d["username"],
                email=d["email"],
                password_hash=d["password_hash"],
                salt=d["salt"],
                initial_balance=float(d.get("initial_balance", 10000.0)),
                balance=float(d.get("balance", 10000.0)),
                created_at=str(d.get("created_at", "")),
                last_login_at=d.get("last_login_at"),
            )
        # Tuple fallback
        return User(
            id=row[0],
            username=row[1],
            email=row[2],
            password_hash=row[3],
            salt=row[4],
            initial_balance=float(row[5]),
            balance=float(row[6]),
            created_at=str(row[7]),
            last_login_at=row[8] if len(row) > 8 else None,
        )


class SessionRepository:
    """Manages active bearer tokens and session lifecycles in SQLite."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def create_session(
        self,
        user_id: str,
        duration_seconds: int = 86400 * 30,  # 30 days default
        token: str | None = None,
    ) -> UserSession:
        """Creates and stores a new bearer session token for a user."""
        tok = token or generate_session_token()
        created_at = now_iso()
        expires_at = int(time.time()) + duration_seconds

        self._conn.execute(
            """
            INSERT INTO user_sessions (token, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (tok, user_id, created_at, expires_at),
        )
        self._conn.commit()

        return UserSession(
            token=tok,
            user_id=user_id,
            created_at=created_at,
            expires_at=expires_at,
        )

    def get_session(self, token: str, validate_expiry: bool = True) -> UserSession | None:
        """
        Retrieves a session by token.
        If validate_expiry is True and token has expired, removes it and returns None.
        """
        cur = self._conn.execute(
            "SELECT * FROM user_sessions WHERE token = ?",
            (token,),
        )
        row = cur.fetchone()
        if not row:
            return None

        session = self._to_model(row)
        if validate_expiry and session.is_expired():
            self.delete_session(token)
            return None

        return session

    def delete_session(self, token: str) -> bool:
        """Revokes/deletes a single session token (logout)."""
        cur = self._conn.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
        self._conn.commit()
        return cur.rowcount > 0

    def delete_user_sessions(self, user_id: str) -> int:
        """Revokes all active sessions for a user."""
        cur = self._conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        self._conn.commit()
        return cur.rowcount

    def cleanup_expired_sessions(self) -> int:
        """Deletes all sessions that have passed their expiration timestamp."""
        now = int(time.time())
        cur = self._conn.execute("DELETE FROM user_sessions WHERE expires_at < ?", (now,))
        self._conn.commit()
        return cur.rowcount

    @staticmethod
    def _to_model(row: sqlite3.Row | tuple) -> UserSession:
        if isinstance(row, sqlite3.Row) or hasattr(row, "keys"):
            d = dict(row)
            return UserSession(
                token=d["token"],
                user_id=d["user_id"],
                created_at=str(d.get("created_at", "")),
                expires_at=int(d["expires_at"]),
            )
        return UserSession(
            token=row[0],
            user_id=row[1],
            created_at=str(row[2]),
            expires_at=int(row[3]),
        )

