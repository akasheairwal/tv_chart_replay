# Trading Chart Replayer — First-Time Environment Setup (`setup.md`)

This guide walks you through setting up your development environment from scratch for the **Trading Chart Replayer** terminal.

---

## 1. Prerequisites & System Requirements

Ensure you have the following installed on your machine:

1. **Python**: Python **3.12** (or 3.11).
   - Check version: `python --version` or `py -3.12 --version`
2. **Node.js**: Node.js **>= 20.x** and `npm`.
   - Check version: `node -v` and `npm -v`
3. **Git**: Standard git client.

---

## 2. One-Time Setup Steps

Open PowerShell or Command Prompt in the repository root directory (`d:\code\tv_chart_replay`):

### Step A: Create and Activate Python Virtual Environment

```powershell
# 1. Create a Python 3.12 virtual environment in .venv
py -3.12 -m venv .venv

# 2. Activate the virtual environment (PowerShell)
.venv\Scripts\Activate.ps1

# (If using CMD instead)
# .venv\Scripts\activate.bat
```

### Step B: Install Python Dependencies

```powershell
# Upgrade pip and setuptools
.venv\Scripts\python -m pip install --upgrade pip setuptools

# Install dependencies (includes PySide6, Polars, Pydantic, yfinance, pytest, ruff)
.venv\Scripts\pip install -r requirements.txt

# Install the app package in editable mode
.venv\Scripts\pip install -e .
```

### Step C: Install Frontend Dependencies

```powershell
# Install Node.js npm packages (Lightweight Charts, Vite, TypeScript, Vitest)
npm install
```

---

## 3. Verify Your Installation

Run the automated verification suite to confirm everything is installed and working:

```powershell
# 1. Verify TypeScript types
npm run typecheck

# 2. Run Frontend Vitest tests
npm test

# 3. Run Python backend pytest suite
.venv\Scripts\python -m pytest

# 4. Test production frontend bundle build
.venv\Scripts\python scripts\build.py
```

If all 4 commands complete cleanly, your environment setup is complete!

---

## 4. Next Steps

Refer to [`daily_startup.md`](file:///d:/code/tv_chart_replay/daily_startup.md) for instructions on running the application daily in **Development Mode** or **Production Mode**.
