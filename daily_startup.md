# Trading Chart Replayer — Daily Startup Guide (`daily_startup.md`)

This guide explains how to start and run the **Trading Chart Replayer** daily, in both **Development Mode** (Hot Reload) and **Production Mode** (Standalone Bundle).

---

## Quick Reference Commands

| Mode | Command | Description |
|---|---|---|
| **Development** | Terminal A: `npm run dev`<br>Terminal B: `.venv\Scripts\python app\main.py --dev` | Hot reload enabled (Vite dev server + PySide6 desktop shell) |
| **Production** | Terminal 1: `.venv\Scripts\python scripts\build.py`<br>Terminal 2: `.venv\Scripts\python app\main.py` | Runs off static built bundle (`frontend/dist/index.html`) |
| **Type Check** | `npm run typecheck` | Validates TypeScript types |
| **Run Tests** | `.venv\Scripts\python -m pytest`<br>`npm test` | Runs Python and TypeScript test suites |

---

## 1. Daily Development Startup (Recommended Workflow)

Development mode allows live editing of TypeScript/HTML/CSS with instant hot-reloading inside the PySide6 desktop window.

### Step 1: Launch Vite Dev Server (Terminal A)
Open PowerShell in `d:\code\tv_chart_replay`:
```powershell
npm run dev
```
*Expected output*: `Vite v5.4.x ready at http://localhost:5173/`

### Step 2: Launch Desktop Shell (Terminal B)
Open a second PowerShell window in `d:\code\tv_chart_replay`:
```powershell
.venv\Scripts\python app\main.py --dev
```
The PySide6 window will launch and connect to `http://localhost:5173` with the live QWebChannel bridge active.

---

## 2. Daily Production Startup (Bundled Shell)

Production mode loads the static `frontend/dist/index.html` file directly via local file protocol (no HTTP server required).

### Step 1: Build Frontend Bundle (One-Time per UI edit)
```powershell
.venv\Scripts\python scripts\build.py
```

### Step 2: Launch Desktop Shell
```powershell
.venv\Scripts\python app\main.py
```

---

## 3. Useful Daily Utilities & Cheat Sheet

### Running Tests
```powershell
# Run all Python backend tests
.venv\Scripts\python -m pytest

# Run all TypeScript frontend tests
npm test
```

### Resetting / Clearing Local Database & Cache
App runtime data, SQLite database, and Parquet data windows are stored in `data/`:
- `data/app.db`: SQLite database for datasets, drawings, watchlist, sessions, and trade journal.
- `data/parquet/`: Raw & normalized Parquet candle files.
- `logs/app.log`: Application logs.

If you ever need a completely clean slate:
```powershell
# PowerShell command to remove runtime data (optional)
Remove-Item -Recurse -Force data\*, logs\*
```

---

## 4. Troubleshooting Checklist

1. **`ModuleNotFoundError: No module named 'app'`**:
   - Ensure you are running python using the virtual environment: `.venv\Scripts\python -m pytest` or `.venv\Scripts\python app\main.py`.
2. **`QWebChannel bridge connection error`**:
   - Ensure the app was launched via PySide6 desktop shell (`app\main.py`), not opened directly in a browser tab (browser mode lacks Qt native C++ transport).
3. **`tsc --noEmit` error on build**:
   - Run `npm run typecheck` to inspect TypeScript type errors.
