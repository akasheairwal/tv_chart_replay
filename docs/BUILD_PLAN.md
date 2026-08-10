# Trading Chart Replayer — Build Plan

Materialized execution plan for
`trading_replayer_revised_complete_architecture.md`.

## 1. Strategy

Contract-first, vertical-slice waves. Each wave leaves the application
runnable and one milestone further along, with tests embedded in the wave.

- The **QWebChannel bridge contract** (`docs/bridge-contract.md`) is the
  hub — defined in Wave 0 and extended with typed commands/events in every
  later wave.
- Python owns time, data, and math. TypeScript renders. Future data is
  blocked in Python, never merely hidden visually (architecture §34, §42, §80).
- A coordinate-conversion **spike** inside Wave 2 de-risks the custom
  drawing engine (the riskiest subsystem) before its dedicated waves.

Progress markers use the doc's "Definition of Done" (§84) as the final gate.

## 2. Critical path

```
W0 (bridge contract) ─► W1 (data pipeline) ─► W2 (chart + coord spike)
                                                     │
                       ┌──────────────────────────────┤
                       ▼                              ▼
                    W3 (replay)                   W5 (drawings basic)
                       │                              │
                       ▼                              ▼
                    W4 (indicators)               W6 (drawings advanced)
                       │                              │
                       ▼                              ▼
                    W7 (sessions = MVP §82) ◄──────────┘
                       ▼
                    W8 (workspace / perf / packaging)
                       ▼
                    W9 (trade simulation — future)
```

## 3. Key decisions (locked early)

| # | Decision | Resolution |
|---|----------|------------|
| D1 | Lightweight Charts version | **v5.x** (native panes → indicator panes & multi-chart). Fall back to v4 only on blocker. |
| D2 | Provider order | Yahoo (default) > Binance (crypto fallback); Dukascopy/NSE later (Wave 1.9 stretch, disabled by default). Ranking keyed on asset class + range coverage. |
| D3 | Indicator engine | Custom NumPy/Polars implementations (doc allows "custom"); no `talib` on Windows. |
| D4 | Bridge serialization | Compact `[[epoch_s,o,h,l,c,v],…]` arrays + chunked initial load; contract in `docs/bridge-contract.md`. |
| D5 | Python version | **3.12** (venv already created). |
| D6 | TS toolchain | Vite (dev server + static `dist/`, relative base for `file://`). |
| D7 | Replay clock | Qt timer-driven engine tick, batching per UI frame at high speed. |

## 4. Wave & phase plan

### Wave 0 — Foundation & Bridge Shell  (doc Phase 1; size M)
- [x] 0.1 Repo scaffold: git init, .gitignore, LICENSE, README, pyproject, requirements, package.json, tsconfig, vite config
- [x] 0.2 Config: `app/config` (Pydantic settings, paths, defaults) + logging
- [x] 0.3 PySide6 shell: `QWebEngineView` main window, dev/prod URL resolution
- [x] 0.4 TypeScript toolchain + app shell (index.html, style, chart placeholder)
- [x] 0.5 Bridge bootstrap: QWebChannel handler (explicit slots) + TS client; ping/pong + version handshake + events
- [x] 0.6 Integration smoke tests: QWebChannel round trip over a real page; full-bundle round trip
- [x] 0.7 Initial commit (post-verification)
- **Exit:** "Empty interactive chart application" with proven bidirectional bridge.

### Wave 1 — Data Acquisition Pipeline  (doc Phase 2; size L)
- [x] 1.1 Canonical models: Symbol, Candle, Dataset, Timeframe + serializers
- [x] 1.2 Storage: Parquet store (windowed reads), SQLite migrations + Dataset Registry schema (§23)
- [x] 1.3 Provider contract + registry/ranking/fallback (§10–12) + rate limiter + health check
- [x] 1.4 Providers: Yahoo (`yfinance`), Binance (public klines); symbol↔ticker mapping
- [x] 1.5 Download manager: job state machine (§16), retry/backoff, progress events (§60)
- [x] 1.6 Normalizer (canonical columns, timezone, sort, dedupe) + resampler (§25–26)
- [x] 1.7 Validator (§19) + gap detector (§20) + partial-coverage calculator (§15)
- [x] 1.8 Bridge commands: `searchSymbols`, `requestDataset`, `loadHistory`, `download.*` events; data-status panel
- [x] 1.9 (stretch) Dukascopy + NSE adapters (registered, disabled by default)
- **Exit:** Search → auto-download → normalize → validate → Parquet → SQLite registry → loadHistory, visible in app.

### Wave 2 — Chart & Visualization Core  (doc Phase 3; size M)
- [x] 2.1 Pin chart version; chart-manager: candlestick series + volume pane, resize
- [x] 2.2 History loading: chunked compact arrays, lazy window reads, visible-range handling
- [x] 2.3 Crosshair, time/price scale, zoom/pan, data-status header
- [x] 2.4 Timeframe selector (display TF via resampler), symbol search UI, watchlist placeholder
- [x] 2.5 **Spike:** drawing overlay canvas + pixel↔(timestamp,price) conversion (de-risks Wave 5/6)
- [x] 2.6 Layout polish per §56, empty/error states
- **Exit:** Interactive historical chart fed by real local data.

### Wave 3 — Replay Engine  (doc Phase 4; size M)
- [x] 3.1 Replay data model/state: warmup, visible `[0..N]`, future hidden (§32)
- [x] 3.2 Engine core: play/pause/step/jump/reset; clock + speeds (§36)
- [x] 3.3 Future-data isolation module (Python-enforced) + §80 critical tests
- [x] 3.4 Replay bridge: `createReplay`, `playReplay`, `replayNext/Previous/JumpTo`, `replay.*` events; batch + incremental updates (§63)
- [x] 3.5 TS replay-controller + timeline + controls (§37 shortcuts, §56 bar)
- [x] 3.6 Random replay (§38), jump-to-date, major-time blocks
- **Exit:** Safe replay; future candles demonstrably blocked.

### Wave 4 — Indicators  (doc Phase 5; size M)
- [x] 4.1 Indicator interface + engine; replay-aware contract `calculate(visible)` (§40–42)
- [x] 4.2 Trend: SMA, EMA, WMA, HMA, VWAP, Supertrend
- [x] 4.3 Momentum: RSI, MACD, Stochastic
- [x] 4.4 Volatility: ATR, Bollinger Bands, Keltner
- [x] 4.5 Volume: OBV, MFI
- [x] 4.6 TS indicator-manager: overlays + panes, settings, add/remove/toggle
- **Exit:** Replay-aware technical analysis with no-leakage tests.

### Wave 5 — Drawing Engine (Basic)  (doc Phase 6; size L)
- [x] 5.1 Engine core: overlay canvas, coordinate conversion, pan/zoom/resize sync
- [x] 5.2 Geometry + hit-testing + handles + move/resize/delete + lock/visibility
- [x] 5.3 Tool registry + interaction state machine (§46)
- [x] 5.4 Trend line, Ray, Horizontal, Vertical (§48)
- [x] 5.5 Rectangle, Ellipse, Text, Arrow
- [x] 5.6 Persistence: `drawing.*` events → SQLite; serialization round-trip (§51–52)
- **Exit:** Draw/move/resize/delete/save/restore basic drawings (doc MVP).

### Wave 6 — Drawing Engine (Advanced)  (doc Phase 7; size M)
- [x] 6.1 Fibonacci: retracement, extension, time zones (§49–50)
- [x] 6.2 Channels: parallel, regression, equidistant
- [x] 6.3 Pitchfork variants, Gann fan/box
- [x] 6.4 Measurement tools + callouts/labels
- [x] 6.5 Toolbar categories (§57), drawing list, style editor
- **Exit:** Complete drawing toolbox.

### Wave 7 — Sessions  (doc Phase 8; size M)  → **MVP §82**
- [x] 7.1 Session models (§53)
- [x] 7.2 Manager + JSON serializer + SQLite save/load + autosave
- [x] 7.3 Dataset versioning (§55): pinned versions, mismatch detection
- [x] 7.4 Full restore flow (chart → replay → indicators → drawings)
- [x] 7.5 File menu + session list UI
- **Exit:** MVP workflow green: search → download → chart → replay → controls → trendline → save → restore.

### Wave 8 — Workspace, Performance & Packaging  (doc Phase 9; size L)
- [x] 8.1 Watchlist (favorites, persistence, click-to-load)
- [x] 8.2 Workspace layouts 1/2/4/6 charts + templates
- [x] 8.3 Multi-chart/multi-TF sync under one master clock (§68–69)
- [x] 8.4 Performance: lazy Parquet windows, bounded caches, minimized bridge traffic (§64–67)
- [x] 8.5 Resilience UX: provider failure flow, repair/retry, log viewer (§74–76)
- [x] 8.6 Packaging: PyInstaller + TS dist bundling, Windows build, release checklist
- **Exit:** §84 Definition-of-Done fully green; distributable .exe.

### Wave 9 — Trade Simulation  (doc Phase 10; size L)
- [x] 9.1 Order engine (market/limit/stop), positions, PnL
- [x] 9.2 Commission, spread, slippage, position sizing, risk
- [x] 9.3 Trade journal
- **Exit:** Simulation layer fed strictly replay-visible data, separate from chart (§70–71).

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Free-provider flakiness (Yahoo scraping) | Registry + fallback chain, raw cache, retry/backoff, health checks |
| Deep forex history requires Dukascopy bi5 parsing | Isolated adapter (gated 1.9); MVP on Yahoo + Binance |
| Drawing overlay coordinate math | Wave 2 spike + Vitest round-trip suites |
| Bridge payload size | Compact arrays, chunked batch + incremental events, lazy windows |
| No `talib` wheels on Windows | Custom NumPy engine (D3) |
| QWebEngine + PyInstaller quirks | Dedicated packaging phase (8.6) |
| Replay leakage bugs | §80 critical tests (Wave 3), indicator-slice tests (Wave 4) |

## 6. DoD gate

Each Wave's exit criteria map to the architecture §84 groups: Data (W1),
Chart (W2), Replay (W3), Indicators (W4), Drawings (W5+W6), Sessions (W7),
Workspace/packaging (W8), Trade simulation (W9). The doc MVP §82 completes at W7.

## 7. Progress

| Wave | Status |
|------|--------|
| W0 Foundation & Bridge Shell | **Complete** (pytest 13/13, vitest 3/3, tsc + vite build green) |
| W1 Data Acquisition Pipeline | **Complete** (pytest 70/70, vitest 3/3, tsc + vite build green) |
| W2 Chart & Visualization Core | **Complete** (pytest 70/70, vitest 7/7, tsc + vite build green) |
| W3 Replay Engine | **Complete** (pytest 79/79, vitest 8/8, tsc + vite build green) |
| W4 Indicators | **Complete** (pytest 85/85, vitest 9/9, tsc + vite build green) |
| W5 Drawing Engine (Basic) | **Complete** (pytest 87/87, vitest 15/15, tsc + vite build green) |
| W6 Drawing Engine (Advanced) | **Complete** (pytest 87/87, vitest 23/23, tsc + vite build green) |
| W7 Sessions (MVP) | **Complete** (pytest 92/92, vitest 28/28, tsc + vite build green) |
| W8 Workspace, Performance & Packaging | **Complete** (pytest 98/98, vitest 32/32, tsc + vite build green) |
| W9 Trade Simulation | **Complete** (pytest 103/103, vitest 34/34, tsc + vite build green) |