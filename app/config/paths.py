"""Filesystem path layout for the application."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Paths:
    """Centralized filesystem layout (architecture ``#6``).

    Path attributes are absolute.  :meth:`ensure` materializes the runtime
    directories that must exist on first launch.
    """

    project_root: Path
    data_dir: Path
    raw_dir: Path
    normalized_dir: Path
    exports_dir: Path
    cache_dir: Path
    sessions_dir: Path
    drawings_dir: Path
    logs_dir: Path
    frontend_dir: Path
    frontend_dist: Path
    tests_dir: Path
    database_path: Path

    @classmethod
    def create(cls, root: Path | None = None) -> Paths:
        root = (root or PROJECT_ROOT).resolve()
        data_dir = root / "data"
        return cls(
            project_root=root,
            data_dir=data_dir,
            raw_dir=data_dir / "raw",
            normalized_dir=data_dir / "normalized",
            exports_dir=data_dir / "exports",
            cache_dir=data_dir / "cache",
            sessions_dir=root / "sessions",
            drawings_dir=root / "drawings",
            logs_dir=root / "logs",
            frontend_dir=root / "frontend",
            frontend_dist=root / "frontend" / "dist",
            tests_dir=root / "tests",
            database_path=data_dir / "app.db",
        )

    def ensure(self) -> Paths:
        """Create runtime directories that must exist."""
        for directory in (
            self.data_dir,
            self.raw_dir,
            self.normalized_dir,
            self.exports_dir,
            self.cache_dir,
            self.sessions_dir,
            self.drawings_dir,
            self.logs_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)
        return self


@lru_cache(maxsize=1)
def get_paths() -> Paths:
    return Paths.create()
