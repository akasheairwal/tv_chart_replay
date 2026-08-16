"""
Release Packaging Script — builds frontend assets and packages standalone Windows executable with PyInstaller (Architecture §83.9 / Wave 8.6).
"""

import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


def build_frontend() -> bool:
    print("=== Step 1: Building Frontend Bundle (npm run build) ===")
    try:
        subprocess.run(["npm.cmd" if sys.platform == "win32" else "npm", "run", "build"], cwd=ROOT_DIR, check=True)
        print("✅ Frontend build completed successfully.")
        return True
    except subprocess.SubprocessError as err:
        print(f"❌ Frontend build failed: {err}")
        return False


def build_executable() -> bool:
    print("\n=== Step 2: Packaging Executable with PyInstaller ===")
    dist_dir = ROOT_DIR / "frontend" / "dist"
    if not dist_dir.exists():
        dist_dir = ROOT_DIR / "dist"

    if not dist_dir.exists():
        print("❌ Frontend dist directory not found!")
        return False

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--windowed",
        "--name=TradingChartReplayer",
        f"--add-data={dist_dir};frontend/dist",
        "--collect-all=PySide6",
        str(ROOT_DIR / "app" / "main.py"),
    ]

    print(f"Executing: {' '.join(cmd)}")
    try:
        subprocess.run(cmd, cwd=ROOT_DIR, check=True)
        exe_path = ROOT_DIR / "dist" / "TradingChartReplayer" / "TradingChartReplayer.exe"
        if exe_path.exists():
            print(f"\n🎉 Standalone Windows Executable built successfully!\nExecutable location: {exe_path}")
            return True
        else:
            print("⚠️ PyInstaller finished but executable was not found at expected path.")
            return False
    except subprocess.CalledProcessError as err:
        print(f"❌ PyInstaller build failed with return code {err.returncode}")
        return False
    except OSError as err:
        print(f"❌ Packaging failed: {err}")
        return False


def main():
    print("=" * 60)
    print("  Historical Trading Chart Replayer — Release Builder")
    print("=" * 60)

    if not build_frontend():
        sys.exit(1)

    # Note: PyInstaller execution
    success = build_executable()
    if not success:
        print("Release build incomplete or PyInstaller failed.")
    else:
        print("\n✅ Definition of Done (§84) Gate Green — Packaging Complete.")


if __name__ == "__main__":
    main()
