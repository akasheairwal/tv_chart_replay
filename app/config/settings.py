"""Application settings (Pydantic-settings backed, env prefix ``TR_``)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    """Application configuration.

    Values can be overridden through environment variables with the
    ``TR_`` prefix or a root-level ``.env`` file.
    """

    model_config = SettingsConfigDict(
        env_prefix="TR_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Trading Chart Replayer"
    app_version: str = "0.1.0"

    window_width: int = 1440
    window_height: int = 900

    dev_server_url: str = "http://127.0.0.1:5173/"

    log_level: str = "INFO"
    log_format: str = "%(asctime)s %(levelname)s %(name)s %(message)s"


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    """Return the process-wide settings singleton."""
    return AppSettings()
