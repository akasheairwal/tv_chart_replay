"""Build the TypeScript frontend bundle.

Runs `npm run build` (tsc type-check + vite bundle).  Output lands in
``frontend/dist`` and is loaded by the desktop app in production mode.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def npm_command() -> list[str]:
    if sys.platform == "win32":
        return [shutil.which("npm.cmd") or "npm.cmd"]
    return ["npm"]


def run(command: list[str]) -> None:
    print(f"$ {' '.join(command)}", flush=True)
    subprocess.check_call(command, cwd=str(ROOT))


def main() -> int:
    if not (ROOT / "node_modules").is_dir():
        run(npm_command() + ["install"])
    run(npm_command() + ["run", "build"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
