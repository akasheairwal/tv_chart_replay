"""
Cryptographic and security utilities for user authentication.

Implements secure password hashing with PBKDF2-HMAC-SHA256, cryptographic salts,
constant-time comparisons, and secure bearer token generation.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid


DEFAULT_ITERATIONS = 100_000
DEFAULT_SALT_BYTES = 16


def hash_password(
    password: str,
    salt: str | None = None,
    iterations: int = DEFAULT_ITERATIONS,
) -> tuple[str, str]:
    """
    Hashes a plaintext password using PBKDF2-HMAC-SHA256.

    Args:
        password: The plaintext password to hash.
        salt: Optional hexadecimal salt string. If None, a cryptographically secure
              random salt will be generated.
        iterations: Number of PBKDF2 hashing iterations (default: 100,000).

    Returns:
        A tuple of `(password_hash_hex, salt_hex)`.
    """
    if not password:
        raise ValueError("Password cannot be empty")

    if salt is None:
        salt = secrets.token_hex(DEFAULT_SALT_BYTES)

    derived_key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return derived_key.hex(), salt


def verify_password(
    password: str,
    password_hash: str,
    salt: str,
    iterations: int = DEFAULT_ITERATIONS,
) -> bool:
    """
    Verifies a plaintext password against a stored PBKDF2 hash using constant-time comparison.

    Args:
        password: The candidate plaintext password.
        password_hash: The stored hexadecimal password hash.
        salt: The hexadecimal salt used during hashing.
        iterations: Number of PBKDF2 iterations used during hashing.

    Returns:
        True if the password matches the hash, False otherwise.
    """
    if not password or not password_hash or not salt:
        return False

    try:
        derived_key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
        )
        return hmac.compare_digest(derived_key.hex(), password_hash)
    except Exception:
        return False


def generate_session_token(nbytes: int = 32) -> str:
    """
    Generates a cryptographically secure URL-safe bearer token.

    Args:
        nbytes: Number of random bytes (default: 32 -> 256 bits of entropy).

    Returns:
        URL-safe string representation of the token.
    """
    return secrets.token_urlsafe(nbytes)


def generate_user_id() -> str:
    """
    Generates a unique prefixed user ID.

    Returns:
        String in the format `usr_<12_hex_chars>`.
    """
    return f"usr_{uuid.uuid4().hex[:12]}"

