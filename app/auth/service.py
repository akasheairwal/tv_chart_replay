"""
High-level authentication and user account service.
"""

from __future__ import annotations

import logging
from typing import Any

from app.auth.crypto import hash_password, verify_password
from app.auth.models import User, UserSession
from app.auth.repository import SessionRepository, UserRepository

logger = logging.getLogger(__name__)


class AuthService:
    """Orchestrates user registration, authentication, sessions, and credentials."""

    def __init__(self, user_repo: UserRepository, session_repo: SessionRepository) -> None:
        self.user_repo = user_repo
        self.session_repo = session_repo

    def register(
        self,
        username: str,
        email: str,
        password: str,
        initial_balance: float = 10000.0,
    ) -> tuple[User, UserSession]:
        """
        Registers a new user and generates an active session token.

        Raises:
            ValueError: If inputs are invalid or username/email is taken.
        """
        if not password or len(password) < 6:
            raise ValueError("Password must be at least 6 characters long")

        password_hash, salt = hash_password(password)
        user = self.user_repo.create_user(
            username=username,
            email=email,
            password_hash=password_hash,
            salt=salt,
            initial_balance=initial_balance,
        )

        session = self.session_repo.create_session(user.id)
        logger.info("Registered new user: %s (%s)", user.username, user.id)
        return user, session

    def login(
        self,
        login: str,
        password: str,
    ) -> tuple[User, UserSession]:
        """
        Authenticates a user by username or email and creates a new session.

        Raises:
            ValueError: If credentials are invalid.
        """
        if not login or not password:
            raise ValueError("Username/email and password are required")

        user = self.user_repo.get_by_login(login)
        if user is None:
            raise ValueError("Invalid username/email or password")

        if not verify_password(password, user.password_hash, user.salt):
            raise ValueError("Invalid username/email or password")

        self.user_repo.update_last_login(user.id)
        session = self.session_repo.create_session(user.id)
        logger.info("User logged in: %s (%s)", user.username, user.id)
        return user, session

    def logout(self, token: str) -> bool:
        """Revokes an active session token."""
        if not token:
            return False
        clean_token = self._clean_token(token)
        return self.session_repo.delete_session(clean_token)

    def authenticate_token(self, token: str) -> User | None:
        """
        Validates a bearer token and returns the corresponding User if valid and active.
        """
        if not token:
            return None
        clean_token = self._clean_token(token)
        session = self.session_repo.get_session(clean_token, validate_expiry=True)
        if session is None:
            return None
        return self.user_repo.get_by_id(session.user_id)

    def get_user_profile(self, user_id: str) -> dict[str, Any] | None:
        """Returns non-sensitive profile dictionary for a user."""
        user = self.user_repo.get_by_id(user_id)
        return user.to_dict() if user else None

    def reset_account(self, user_id: str, target_balance: float | None = None) -> float:
        """Resets a user's paper balance."""
        return self.user_repo.reset_balance(user_id, target_balance)

    @staticmethod
    def _clean_token(token: str) -> str:
        tok = token.strip()
        if tok.lower().startswith("bearer "):
            return tok[7:].strip()
        return tok

