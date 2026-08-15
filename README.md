# Trading Chart Replayer

Standalone historical trading chart replay terminal (TradingView-style).

- **Local-first**: free/public data sources only, never a paid API.
- **Python is the brain**: data acquisition, normalization, validation,
  storage (Parquet + SQLite), replay engine, indicator math.
- **TypeScript renders**: Lightweight Charts + a custom drawing engine.
- **QWebChannel bridge**: local Python <-> JS communication. No HTTP server.

- **First-time setup guide**: [`setup.md`](file:///d:/code/tv_chart_replay/setup.md)
- **Daily startup & workflow guide**: [`daily_startup.md`](file:///d:/code/tv_chart_replay/daily_startup.md)
- Full architecture: `trading_replayer_revised_complete_architecture.md`
- Build plan (waves & phases): `docs/BUILD_PLAN.md`
- Bridge contract: `docs/bridge-contract.md`

## Requirements

- Python **3.12** (3.11 also supported; not 3.14 yet)
- Node.js >= 20 and npm

## Development quick start

```powershell
# 1. Python environment
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 2. Frontend dependencies + TypeScript checks
npm install
npm run typecheck

# 3. Terminal A - Vite dev server
npm run dev

# 4. Terminal B - desktop shell (loads the dev server)
.venv\Scripts\python app\main.py --dev
```

## Production build

```powershell
.venv\Scripts\python scripts\build.py   # npm run build (tsc + vite) -> frontend/dist
.venv\Scripts\python app\main.py        # loads frontend/dist/index.html
```

## Tests

```powershell
pytest                    # Python unit + QWebEngine integration tests (headless/offscreen)
npm test                  # TypeScript (vitest)
npm run typecheck         # TypeScript type checking
```

## Module layout

```
app/          Python core (config, bridge, data, replay, indicators, sessions, database)
frontend/     TypeScript app (chart, drawings, replay UI, bridge client)
tests/        pytest (python) + vitest (frontend)
docs/         build plan + bridge contract
data/         raw / normalized Parquet / exports / cache   (runtime, gitignored)
sessions/     saved replay sessions                         (runtime, gitignored)
drawings/     exported drawings                             (runtime, gitignored)
logs/         structured logs                               (runtime, gitignored)
```
