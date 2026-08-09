# Historical Trading Chart Replayer

## Complete Architecture, Data Provider, Replay, Chart & Drawing Specification

> **Project type:** Standalone desktop trading application\
> **Primary goal:** Build a TradingView-style historical chart replay
> terminal with automatic historical-data acquisition, replay,
> indicators, and a comprehensive custom drawing system.\
> **Paid APIs:** Not required.\
> **Free APIs / public endpoints / free Python data libraries:**
> Allowed.\
> **Application API server:** None.\
> **Chart:** Lightweight Charts\
> **Desktop framework:** PySide6 + QWebEngineView\
> **Bridge:** QWebChannel\
> **Data processing:** Polars/Pandas + NumPy\
> **Storage:** Parquet + SQLite\
> **Frontend:** TypeScript\
> **Replay:** Python-controlled, replay-safe\
> **Drawings:** Custom TypeScript drawing engine

------------------------------------------------------------------------

# 1. Project Vision

The application is a standalone historical market-data replay terminal.

The user should be able to:

1.  Search for a symbol.
2.  Select a timeframe.
3.  Select a historical range.
4.  Automatically check whether the required data is already stored
    locally.
5.  If data is missing, automatically select a free/public data
    provider.
6.  Download only the missing data.
7.  Normalize provider-specific data into a canonical OHLCV format.
8.  Validate the dataset.
9.  Store the normalized dataset locally as Parquet.
10. Open a high-performance interactive candlestick chart.
11. Start replay from any eligible historical point.
12. Advance one candle at a time or play continuously.
13. Use multiple playback speeds.
14. Add indicators without future-data leakage.
15. Use TradingView-style drawing tools.
16. Save and restore drawings.
17. Save and restore complete replay sessions.
18. Optionally simulate trades in a future phase.

The application must remain independent of any paid TradingView data
service.

------------------------------------------------------------------------

# 2. Critical Terminology

## 2.1 No application API server

The project does **not** require:

-   FastAPI
-   Flask
-   REST API
-   local HTTP backend
-   WebSocket backend
-   cloud backend

Python and the embedded TypeScript application communicate through
`QWebChannel`.

## 2.2 Free external APIs are allowed

The application may access:

-   free APIs
-   public HTTP endpoints
-   free market-data libraries
-   public exchange endpoints
-   free historical-data providers

The application should never require a paid subscription for its core
functionality.

## 2.3 Provider limitations must be expected

Free sources may have:

-   rate limits
-   outages
-   incomplete history
-   symbol differences
-   delayed data
-   missing candles
-   changing endpoints
-   provider-specific timezone conventions
-   corporate-action adjustments
-   API restrictions

The provider abstraction must isolate these differences.

------------------------------------------------------------------------

# 3. Core Design Principles

## 3.1 Local-first

``` mermaid
flowchart LR
    User[User] --> App[Desktop Application]
    App --> Python[Python Core]
    App --> WebView[Embedded WebView]
    Python --> LocalData[(Local Data)]
    Python --> SQLite[(Metadata)]
    Python --> FreeProviders[Free External Data Providers]
    WebView --> Chart[Lightweight Charts]
```

------------------------------------------------------------------------

## 3.2 No paid data dependency

``` mermaid
flowchart TD
    Request[Historical Data Request]
    Request --> ProviderRegistry[Provider Registry]

    ProviderRegistry --> Free1[Free Provider 1]
    ProviderRegistry --> Free2[Free Provider 2]
    ProviderRegistry --> Free3[Free Provider 3]
    ProviderRegistry --> Free4[Free Provider 4]

    Free1 --> Normalize[Canonical Normalizer]
    Free2 --> Normalize
    Free3 --> Normalize
    Free4 --> Normalize

    Normalize --> Local[(Local Dataset)]
```

The architecture must never assume one provider will always be
available.

------------------------------------------------------------------------

## 3.3 One canonical dataset

All providers must normalize into the same internal schema.

``` mermaid
flowchart LR
    ProviderA[Provider A] --> Normalizer[Data Normalizer]
    ProviderB[Provider B] --> Normalizer
    ProviderC[Provider C] --> Normalizer
    ProviderD[Provider D] --> Normalizer

    Normalizer --> Canonical[Canonical OHLCV]
    Canonical --> Parquet[(Parquet)]
    Parquet --> Replay[Replay]
    Parquet --> Indicators[Indicators]
    Parquet --> Chart[Chart]
```

This prevents the chart, replay engine, and future backtester from using
incompatible data representations.

------------------------------------------------------------------------

# 4. High-Level Architecture

``` mermaid
flowchart TB
    User[Trader]

    subgraph Desktop["Standalone Desktop Application"]
        UI[Application UI]
        Search[Symbol Search]
        Chart[Lightweight Charts]
        Draw[Drawing Engine]
        ReplayControls[Replay Controls]

        subgraph PythonCore["Python Core"]
            Symbols[Symbol Registry]
            Providers[Provider Registry]
            Downloader[Download Manager]
            Normalizer[Normalizer]
            Validator[Validator]
            Storage[Dataset Storage]
            Replay[Replay Engine]
            Indicators[Indicator Engine]
            Sessions[Session Manager]
        end

        Bridge[QWebChannel Bridge]
    end

    subgraph LocalStorage["Local Storage"]
        Raw[(Raw Cache)]
        Parquet[(Normalized Parquet)]
        SQLite[(SQLite Metadata)]
        SessionFiles[(Session Files)]
    end

    subgraph FreeSources["Free / Public Data Sources"]
        Yahoo[Yahoo Finance / yfinance]
        Dukascopy[Dukascopy]
        NSE[NSE-compatible source]
        Binance[Binance]
        Other[Other Free Providers]
    end

    User --> UI
    UI --> Search
    Search --> Symbols
    Search --> Providers

    Providers --> Downloader
    Downloader --> Yahoo
    Downloader --> Dukascopy
    Downloader --> NSE
    Downloader --> Binance
    Downloader --> Other

    Downloader --> Raw
    Raw --> Normalizer
    Normalizer --> Validator
    Validator --> Parquet
    Validator --> SQLite

    Parquet --> Storage
    Storage --> Replay
    Replay --> Indicators
    Replay --> Sessions
    Indicators --> Sessions
    Sessions --> SQLite
    Sessions --> SessionFiles

    Replay --> Bridge
    Indicators --> Bridge
    Sessions --> Bridge

    Bridge <--> Chart
    Bridge <--> Draw
    Bridge <--> ReplayControls
```

------------------------------------------------------------------------

# 5. Technology Stack

  Layer                  Technology
  ---------------------- ---------------------------------------------
  Main language          Python
  Desktop framework      PySide6
  Embedded browser       QWebEngineView
  Frontend               TypeScript
  Chart                  Lightweight Charts
  Python ↔ JS            QWebChannel
  Data processing        Polars / Pandas
  Numerical operations   NumPy
  Technical indicators   TA-Lib / pandas-ta / custom
  Primary storage        Parquet
  Metadata               SQLite
  Configuration          TOML/YAML + Pydantic
  Logging                Python logging
  Testing                pytest + TypeScript test framework
  Packaging              PyInstaller
  External data          Free APIs/public endpoints/Python libraries

------------------------------------------------------------------------

# 6. Repository Structure

``` text
trading-replayer/
│
├── README.md
├── LICENSE
├── pyproject.toml
├── requirements.txt
├── package.json
├── tsconfig.json
│
├── app/
│   ├── main.py
│   │
│   ├── config/
│   │   ├── settings.py
│   │   ├── paths.py
│   │   └── defaults.py
│   │
│   ├── bridge/
│   │   ├── channel.py
│   │   ├── commands.py
│   │   ├── events.py
│   │   └── serializers.py
│   │
│   ├── data/
│   │   ├── models/
│   │   │   ├── symbol.py
│   │   │   ├── candle.py
│   │   │   ├── dataset.py
│   │   │   └── timeframe.py
│   │   │
│   │   ├── providers/
│   │   │   ├── base.py
│   │   │   ├── registry.py
│   │   │   ├── yahoo.py
│   │   │   ├── dukascopy.py
│   │   │   ├── nse.py
│   │   │   ├── binance.py
│   │   │   └── generic.py
│   │   │
│   │   ├── downloader/
│   │   │   ├── manager.py
│   │   │   ├── job.py
│   │   │   ├── progress.py
│   │   │   └── retry.py
│   │   │
│   │   ├── normalization/
│   │   │   ├── normalizer.py
│   │   │   ├── timezone.py
│   │   │   └── resampler.py
│   │   │
│   │   ├── validation/
│   │   │   ├── validator.py
│   │   │   ├── gap_detector.py
│   │   │   └── duplicate_detector.py
│   │   │
│   │   ├── storage/
│   │   │   ├── parquet_store.py
│   │   │   ├── csv_store.py
│   │   │   └── dataset_store.py
│   │   │
│   │   └── registry/
│   │       ├── dataset_registry.py
│   │       └── symbol_registry.py
│   │
│   ├── replay/
│   │   ├── engine.py
│   │   ├── state.py
│   │   ├── clock.py
│   │   ├── controller.py
│   │   └── random_start.py
│   │
│   ├── indicators/
│   │   ├── base.py
│   │   ├── engine.py
│   │   ├── trend.py
│   │   ├── momentum.py
│   │   ├── volatility.py
│   │   └── volume.py
│   │
│   ├── sessions/
│   │   ├── manager.py
│   │   ├── serializer.py
│   │   └── models.py
│   │
│   └── database/
│       ├── connection.py
│       ├── migrations.py
│       └── repositories.py
│
├── frontend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.ts
│   │
│   │   ├── chart/
│   │   │   ├── chart-manager.ts
│   │   │   ├── candle-series.ts
│   │   │   ├── volume-series.ts
│   │   │   ├── crosshair.ts
│   │   │   ├── viewport.ts
│   │   │   └── synchronization.ts
│   │
│   │   ├── drawings/
│   │   │   ├── drawing-engine.ts
│   │   │   ├── drawing-base.ts
│   │   │   ├── drawing-registry.ts
│   │   │   ├── geometry.ts
│   │   │   ├── hit-testing.ts
│   │   │   ├── serialization.ts
│   │   │   └── tools/
│   │   │       ├── cursor.ts
│   │   │       ├── trend-line.ts
│   │   │       ├── ray.ts
│   │   │       ├── horizontal-line.ts
│   │   │       ├── vertical-line.ts
│   │   │       ├── rectangle.ts
│   │   │       ├── ellipse.ts
│   │   │       ├── triangle.ts
│   │   │       ├── fibonacci-retracement.ts
│   │   │       ├── fibonacci-extension.ts
│   │   │       ├── fibonacci-channel.ts
│   │   │       ├── parallel-channel.ts
│   │   │       ├── regression-channel.ts
│   │   │       ├── pitchfork.ts
│   │   │       ├── gann.ts
│   │   │       ├── text.ts
│   │   │       ├── arrow.ts
│   │   │       └── measurement.ts
│   │
│   │   ├── replay/
│   │   │   ├── replay-controller.ts
│   │   │   ├── replay-view.ts
│   │   │   └── replay-timeline.ts
│   │
│   │   ├── indicators/
│   │   │   ├── indicator-manager.ts
│   │   │   └── indicator-series.ts
│   │
│   │   ├── ui/
│   │   │   ├── toolbar.ts
│   │   │   ├── symbol-search.ts
│   │   │   ├── timeframe-selector.ts
│   │   │   ├── watchlist.ts
│   │   │   └── settings.ts
│   │
│   │   └── bridge/
│   │       ├── python-bridge.ts
│   │       └── bridge-types.ts
│   │
│   └── index.html
│
├── data/
│   ├── raw/
│   ├── normalized/
│   ├── exports/
│   └── cache/
│
├── sessions/
├── drawings/
├── logs/
│
├── tests/
│   ├── python/
│   └── frontend/
│
└── scripts/
    ├── build.py
    ├── validate_data.py
    └── export_dataset.py
```

------------------------------------------------------------------------

# 7. Startup Flow

``` mermaid
sequenceDiagram
    participant User
    participant App
    participant PySide
    participant WebView
    participant Bridge
    participant Frontend

    User->>App: Launch
    App->>PySide: Initialize QApplication
    PySide->>PySide: Load settings
    PySide->>PySide: Initialize SQLite
    PySide->>PySide: Initialize registries
    PySide->>WebView: Create QWebEngineView
    WebView->>Bridge: Initialize QWebChannel
    Bridge->>Frontend: Register bridge
    Frontend->>Frontend: Initialize UI
    Frontend->>Frontend: Initialize Lightweight Charts
    Frontend->>Frontend: Initialize Drawing Engine
    Frontend-->>User: Ready
```

------------------------------------------------------------------------

# 8. Symbol Search

The user should be able to search by:

-   ticker
-   symbol
-   company name
-   exchange
-   asset class
-   provider

``` mermaid
flowchart TD
    Search[User enters search]
    Search --> Normalize[Normalize query]
    Normalize --> Local[Search local symbol registry]

    Local --> Results{Results found?}

    Results -->|Yes| Display[Display results]
    Results -->|No| ProviderSearch[Search free provider catalogs]

    ProviderSearch --> Merge[Merge provider results]
    Merge --> Display

    Display --> Select[User selects symbol]
    Select --> Canonical[Resolve canonical symbol]
    Canonical --> Dataset[Check dataset]
```

------------------------------------------------------------------------

# 9. Canonical Symbol Model

Example:

``` json
{
  "symbol": "EURUSD",
  "display_name": "EUR/USD",
  "asset_class": "forex",
  "exchange": "FX",
  "provider_candidates": [
    "dukascopy",
    "yahoo"
  ],
  "timezone": "UTC"
}
```

The canonical symbol must not be tied to one provider's ticker format.

------------------------------------------------------------------------

# 10. Free Provider Architecture

``` mermaid
classDiagram
    class DataProvider {
        <<interface>>
        +name()
        +supports_symbol()
        +supports_timeframe()
        +get_symbol_metadata()
        +get_available_range()
        +download()
        +health_check()
    }

    class YahooProvider {
        +download()
        +health_check()
    }

    class DukascopyProvider {
        +download()
        +health_check()
    }

    class NSEProvider {
        +download()
        +health_check()
    }

    class BinanceProvider {
        +download()
        +health_check()
    }

    class ProviderRegistry {
        +register()
        +resolve()
        +rank()
        +fallback()
    }

    DataProvider <|-- YahooProvider
    DataProvider <|-- DukascopyProvider
    DataProvider <|-- NSEProvider
    DataProvider <|-- BinanceProvider
    ProviderRegistry --> DataProvider
```

------------------------------------------------------------------------

# 11. Provider Selection

Provider selection should consider:

1.  asset class
2.  symbol support
3.  timeframe support
4.  requested historical range
5.  provider health
6.  provider rate limits
7.  data quality
8.  local coverage
9.  provider priority

``` mermaid
flowchart TD
    Request[Data Request]
    Request --> Registry[Provider Registry]
    Registry --> Candidates[Find Candidate Providers]
    Candidates --> Symbol[Check Symbol Support]
    Symbol --> TF[Check Timeframe]
    TF --> Range[Check Historical Range]
    Range --> Health[Check Provider Health]
    Health --> Rank[Rank Providers]
    Rank --> Select[Select Best Provider]
```

------------------------------------------------------------------------

# 12. Provider Fallback

``` mermaid
flowchart TD
    Request[Download Request]
    Request --> P1[Primary Free Provider]
    P1 --> S1{Success?}

    S1 -->|Yes| Normalize[Normalize]
    S1 -->|No| P2[Secondary Free Provider]

    P2 --> S2{Success?}
    S2 -->|Yes| Normalize
    S2 -->|No| P3[Tertiary Free Provider]

    P3 --> S3{Success?}
    S3 -->|Yes| Normalize
    S3 -->|No| Failure[No suitable provider]

    Normalize --> Validate[Validate]
```

------------------------------------------------------------------------

# 13. Provider Rate Limiting

Free providers must have local rate-limit protection.

``` mermaid
flowchart TD
    Request[Download Request]
    Request --> Limiter[Provider Rate Limiter]
    Limiter --> Allowed{Allowed?}

    Allowed -->|Yes| Send[Send Request]
    Allowed -->|No| Queue[Wait / Queue]

    Queue --> Limiter
    Send --> Response[Response]
    Response --> Success{Success?}

    Success -->|Yes| Done[Done]
    Success -->|No| Backoff[Exponential Backoff]
    Backoff --> Limiter
```

Provider configuration:

``` yaml
providers:
  dukascopy:
    enabled: true
    priority: 100
    max_concurrency: 2
    min_request_interval_ms: 250

  yahoo:
    enabled: true
    priority: 80
    max_concurrency: 2

  binance:
    enabled: true
    priority: 90
```

Actual limits must be based on each provider's current rules rather than
assumed values.

------------------------------------------------------------------------

# 14. Automatic Dataset Download

``` mermaid
flowchart TD
    Start[Symbol + Timeframe + Range]
    Start --> Registry[Dataset Registry]

    Registry --> Exists{Dataset exists?}

    Exists -->|No| Job[Create Download Job]
    Exists -->|Yes| Coverage[Check Coverage]

    Coverage --> Complete{Fully covered?}

    Complete -->|Yes| Load[Load Local Data]
    Complete -->|No| Missing[Calculate Missing Ranges]

    Missing --> Job

    Job --> Provider[Resolve Free Provider]
    Provider --> Download[Download]
    Download --> Raw[Save Raw Cache]
    Raw --> Normalize[Normalize]
    Normalize --> Validate[Validate]

    Validate --> Valid{Valid?}

    Valid -->|Yes| Store[Store Parquet]
    Valid -->|No| Repair[Repair / Retry]

    Repair --> Download

    Store --> Register[Update Registry]
    Register --> Load
```

------------------------------------------------------------------------

# 15. Partial Coverage

Never redownload the entire dataset if only a small portion is missing.

``` mermaid
flowchart LR
    Request[Requested Range]
    Stored[Stored Coverage]

    Request --> Compare[Coverage Comparison]
    Stored --> Compare

    Compare --> Missing[Missing Intervals]

    Missing --> Before[Missing Before]
    Missing --> After[Missing After]
    Missing --> Middle[Internal Gap]

    Before --> Download
    After --> Download
    Middle --> Download

    Download[Download Only Missing Data]
```

Example:

``` text
Stored:
2020 ───────────────────────── 2025

Requested:
2018 ───────────────────────────────── 2026

Download:
2018 ─────┘                    └────── 2026
```

------------------------------------------------------------------------

# 16. Download Job State Machine

``` mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> QUEUED
    QUEUED --> STARTING
    STARTING --> DOWNLOADING
    DOWNLOADING --> PROCESSING
    PROCESSING --> VALIDATING
    VALIDATING --> SAVING
    SAVING --> COMPLETED

    DOWNLOADING --> RETRYING
    RETRYING --> DOWNLOADING

    DOWNLOADING --> FAILED
    PROCESSING --> FAILED
    VALIDATING --> FAILED
    SAVING --> FAILED

    FAILED --> QUEUED
```

------------------------------------------------------------------------

# 17. Data Pipeline

``` mermaid
flowchart LR
    Source[Free Provider]
    Source --> Raw[Raw Response]
    Raw --> Parse[Parse]
    Parse --> Rename[Canonical Column Names]
    Rename --> Types[Data Types]
    Types --> Timezone[Timezone Normalization]
    Timezone --> Sort[Timestamp Sort]
    Sort --> Dedupe[Duplicate Removal]
    Dedupe --> Gap[Gap Detection]
    Gap --> Validate[OHLCV Validation]
    Validate --> Canonical[Canonical Dataset]
    Canonical --> Parquet[(Parquet)]
```

------------------------------------------------------------------------

# 18. Canonical OHLCV Schema

Minimum:

``` text
timestamp
open
high
low
close
volume
```

Recommended metadata:

``` text
symbol
asset_class
exchange
timeframe
timezone
provider
dataset_version
```

Rules:

``` text
timestamp: UTC internally
open: float
high: float
low: float
close: float
volume: float
```

------------------------------------------------------------------------

# 19. Data Validation

Validation rules:

-   timestamp is finite
-   timestamp is monotonic
-   timestamp is unique
-   open/high/low/close are finite
-   high \>= max(open, close)
-   low \<= min(open, close)
-   high \>= low
-   volume \>= 0
-   timeframe spacing is reasonable
-   duplicates are detected
-   suspicious gaps are recorded
-   invalid rows are rejected or explicitly quarantined

``` mermaid
flowchart TD
    Data[Normalized Dataset]
    Data --> Timestamp[Timestamp Check]
    Timestamp --> OHLC[OHLC Check]
    OHLC --> Volume[Volume Check]
    Volume --> Duplicate[Duplicate Check]
    Duplicate --> Gap[Gap Check]
    Gap --> Timeframe[Timeframe Check]

    Timeframe --> Valid{Valid?}

    Valid -->|Yes| Ready[Dataset READY]
    Valid -->|No| Invalid[Dataset INVALID]
```

------------------------------------------------------------------------

# 20. Gap Detection

Not every gap is an error.

The system should understand market sessions.

``` text
Weekend FX gap:
Expected/normal

NSE overnight gap:
Expected/normal

Random missing 1H candle during active session:
Potential data problem
```

``` mermaid
flowchart TD
    Candles[Candles]
    Candles --> Expected[Calculate Expected Trading Sessions]
    Expected --> Compare[Compare Actual Timestamps]
    Compare --> Gap{Gap Found?}

    Gap -->|No| Good[Continuous]
    Gap -->|Yes| Session[Check Market Session]

    Session --> Normal{Expected Session Gap?}
    Normal -->|Yes| NormalGap[Record as Normal]
    Normal -->|No| DataGap[Record Data Gap]
```

------------------------------------------------------------------------

# 21. Storage Architecture

``` mermaid
flowchart TB
    DataEngine[Data Engine]

    DataEngine --> Raw[(Raw Cache)]
    DataEngine --> Parquet[(Normalized Parquet)]
    DataEngine --> SQLite[(SQLite Metadata)]
    DataEngine --> CSV[CSV Export]

    Raw --> Recovery[Provider Recovery]
    Parquet --> Replay[Replay]
    Parquet --> Indicators[Indicators]
    Parquet --> FutureBacktest[Future Backtesting]
    SQLite --> Registry[Dataset Registry]
    CSV --> UserExport[User Export]
```

------------------------------------------------------------------------

# 22. Storage Directory

``` text
data/
├── raw/
│   ├── dukascopy/
│   ├── yahoo/
│   ├── nse/
│   └── binance/
│
├── normalized/
│   ├── forex/
│   │   └── EURUSD/
│   │       ├── 1m/
│   │       ├── 5m/
│   │       ├── 15m/
│   │       ├── 1h/
│   │       └── 1d/
│   │
│   ├── stocks/
│   ├── indices/
│   ├── futures/
│   ├── metals/
│   └── crypto/
│
├── exports/
└── cache/
```

------------------------------------------------------------------------

# 23. Dataset Registry

SQLite should store:

``` text
dataset_id
symbol
asset_class
provider
timeframe
start_timestamp
end_timestamp
row_count
file_path
file_size
checksum
timezone
schema_version
dataset_version
status
created_at
updated_at
```

Example:

``` json
{
  "dataset_id": "eurusd-1h",
  "symbol": "EURUSD",
  "timeframe": "1H",
  "provider": "dukascopy",
  "start": "2003-01-01T00:00:00Z",
  "end": "2026-08-09T00:00:00Z",
  "rows": 120000,
  "status": "READY",
  "version": 3
}
```

------------------------------------------------------------------------

# 24. Dataset State Machine

``` mermaid
stateDiagram-v2
    [*] --> MISSING
    MISSING --> QUEUED
    QUEUED --> DOWNLOADING
    DOWNLOADING --> NORMALIZING
    NORMALIZING --> VALIDATING
    VALIDATING --> READY

    VALIDATING --> INVALID
    INVALID --> QUEUED

    DOWNLOADING --> FAILED
    FAILED --> QUEUED

    READY --> STALE
    STALE --> QUEUED
```

------------------------------------------------------------------------

# 25. Timeframe Architecture

Supported logical timeframes:

``` text
1m
2m
3m
5m
10m
15m
30m
45m
1H
2H
4H
6H
12H
1D
1W
1M
```

Separate:

``` text
SOURCE TIMEFRAME
```

from:

``` text
DISPLAY TIMEFRAME
```

Example:

``` text
Downloaded source:
1 minute

User selects:
1 hour

System:
1m → resample → 1H
```

------------------------------------------------------------------------

# 26. Timeframe Resampling

``` mermaid
flowchart LR
    M1[Source 1m Candles]
    M1 --> Group[Time Bucket]
    Group --> Open[First Open]
    Group --> High[Maximum High]
    Group --> Low[Minimum Low]
    Group --> Close[Last Close]
    Group --> Volume[Sum Volume]

    Open --> Result[Higher TF Candle]
    High --> Result
    Low --> Result
    Close --> Result
    Volume --> Result
```

------------------------------------------------------------------------

# 27. Chart Architecture

``` mermaid
flowchart TB
    ChartManager[Chart Manager]

    ChartManager --> Main[Main Price Chart]
    ChartManager --> Volume[Volume Pane]
    ChartManager --> IndicatorPanes[Indicator Panes]

    Main --> Candles[Candlestick Series]
    Main --> Overlay[Indicator Overlays]
    Main --> Drawings[Drawing Layer]
    Main --> Crosshair[Crosshair]

    Volume --> Histogram[Volume Histogram]

    IndicatorPanes --> RSI[RSI]
    IndicatorPanes --> MACD[MACD]
```

------------------------------------------------------------------------

# 28. Lightweight Charts Responsibilities

Lightweight Charts handles:

-   candlestick rendering
-   line rendering
-   area rendering
-   histogram rendering
-   time scale
-   price scale
-   crosshair
-   chart resizing
-   visible range
-   viewport interactions
-   series updates

Custom code handles:

-   replay
-   dataset management
-   indicators
-   drawings
-   drawing persistence
-   sessions
-   symbol search
-   downloads

------------------------------------------------------------------------

# 29. Chart Initialization

``` mermaid
sequenceDiagram
    participant Python
    participant Bridge
    participant JS
    participant LWC as Lightweight Charts

    Python->>Bridge: initialize_chart()
    Bridge->>JS: initialize command
    JS->>LWC: createChart()
    JS->>LWC: create candlestick series
    JS->>LWC: create volume series
    JS->>JS: Initialize Drawing Engine
    JS->>JS: Initialize Crosshair
    JS-->>Bridge: chart.ready
    Bridge-->>Python: Ready
```

------------------------------------------------------------------------

# 30. Historical Data Loading

``` mermaid
sequenceDiagram
    participant User
    participant UI
    participant Python
    participant Storage
    participant Bridge
    participant Chart

    User->>UI: Select symbol
    User->>UI: Select timeframe
    UI->>Python: request_dataset()

    Python->>Storage: Check registry
    Storage-->>Python: Dataset information

    Python->>Storage: Load requested range
    Storage-->>Python: OHLCV

    Python->>Bridge: history.loaded
    Bridge->>Chart: Set initial data
    Chart-->>User: Chart displayed
```

------------------------------------------------------------------------

# 31. Replay Architecture

The replay engine is independent of the chart.

``` mermaid
classDiagram
    class ReplayEngine {
        +dataset
        +current_index
        +start_index
        +end_index
        +speed
        +state
        +play()
        +pause()
        +next()
        +previous()
        +jump_to()
        +reset()
    }

    class ReplayState {
        +current_index
        +start_index
        +end_index
        +playing
        +speed
        +current_timestamp
    }

    class ReplayClock {
        +start()
        +stop()
        +tick()
    }

    class ReplayController {
        +play()
        +pause()
        +step_forward()
        +step_backward()
    }

    ReplayEngine --> ReplayState
    ReplayEngine --> ReplayClock
    ReplayController --> ReplayEngine
```

------------------------------------------------------------------------

# 32. Replay Data Model

``` text
Full Dataset
     │
     ├── Warmup Data
     │
     ├── Visible Historical Data
     │
     ├── Current Candle
     │
     └── Future Data
```

At replay index `N`:

``` text
visible = data[0:N+1]
future  = data[N+1:]
```

Future data must never be passed to:

-   chart
-   indicators
-   strategy engine
-   order simulation
-   AI/ML prediction engine

------------------------------------------------------------------------

# 33. Replay Flow

``` mermaid
flowchart TD
    Dataset[Full Historical Dataset]
    Dataset --> Start[Select Replay Start]
    Start --> Warmup[Load Warmup]
    Warmup --> Current[Current Replay Index]
    Current --> Visible[Visible Candles]
    Visible --> Chart[Chart]
    Visible --> Indicators[Indicators]

    Current --> Next{Advance?}

    Next -->|Yes| Increment[Increment Index]
    Increment --> Current

    Next -->|No| Finish[Replay Finished]
```

------------------------------------------------------------------------

# 34. Future Data Protection

``` mermaid
flowchart LR
    Dataset[Full Dataset]

    Dataset --> Past[Replay-visible Data]
    Dataset --> Future[Future Data]

    Past --> Chart[Chart]
    Past --> Indicators[Indicators]
    Past --> Strategy[Future Strategy Engine]

    Future --> Blocked[BLOCKED]
```

This must be enforced in Python, not merely hidden visually.

------------------------------------------------------------------------

# 35. Replay State Machine

``` mermaid
stateDiagram-v2
    [*] --> PAUSED

    PAUSED --> PLAYING: play
    PLAYING --> PAUSED: pause
    PLAYING --> PLAYING: tick

    PAUSED --> PAUSED: next candle
    PAUSED --> PAUSED: previous candle

    PLAYING --> FINISHED: end reached
    FINISHED --> PAUSED: reset
```

------------------------------------------------------------------------

# 36. Replay Speeds

Recommended:

``` text
0.25x
0.5x
1x
2x
5x
10x
25x
50x
100x
```

The clock should be independent of UI rendering frequency.

------------------------------------------------------------------------

# 37. Replay Controls

  Shortcut        Action
  --------------- ---------------------------
  Space           Play/Pause
  Right Arrow     Next candle
  Left Arrow      Previous candle
  Shift + Right   Advance 10 candles
  Shift + Left    Back 10 candles
  Home            Replay start
  End             Replay end
  R               Random replay
  Ctrl + Right    Next major time block
  Ctrl + Left     Previous major time block

------------------------------------------------------------------------

# 38. Random Replay

Random replay should support:

-   random date
-   random session
-   configurable warmup
-   configurable replay duration
-   minimum available history
-   exclusion of insufficient-history regions

``` mermaid
flowchart TD
    Dataset[Dataset]
    Dataset --> Eligible[Find Eligible Start Indexes]
    Eligible --> Random[Random Selection]
    Random --> Start[Replay Start]
    Start --> Warmup[Warmup]
    Warmup --> Replay[Replay Window]
    Replay --> Hidden[Future Hidden]
```

------------------------------------------------------------------------

# 39. Replay Session Start

Recommended configuration:

``` text
Symbol: EURUSD
Timeframe: 1H
Replay start: Random
Warmup: 250 candles
Replay length: 500 candles
Speed: 1x
```

------------------------------------------------------------------------

# 40. Indicator Architecture

``` mermaid
classDiagram
    class Indicator {
        <<interface>>
        +name()
        +calculate(data)
        +metadata()
    }

    class SMA
    class EMA
    class WMA
    class RSI
    class MACD
    class ATR
    class BollingerBands
    class VWAP
    class Supertrend

    Indicator <|-- SMA
    Indicator <|-- EMA
    Indicator <|-- WMA
    Indicator <|-- RSI
    Indicator <|-- MACD
    Indicator <|-- ATR
    Indicator <|-- BollingerBands
    Indicator <|-- VWAP
    Indicator <|-- Supertrend
```

------------------------------------------------------------------------

# 41. Indicator Categories

## Trend

``` text
SMA
EMA
WMA
HMA
VWAP
Supertrend
Ichimoku
```

## Momentum

``` text
RSI
MACD
Stochastic
CCI
ROC
Williams %R
```

## Volatility

``` text
ATR
Bollinger Bands
Keltner Channels
Donchian Channels
```

## Volume

``` text
Volume
OBV
MFI
CMF
VWAP
```

------------------------------------------------------------------------

# 42. Replay-Aware Indicators

Indicators must calculate only from replay-visible candles.

``` mermaid
flowchart TD
    Dataset[Full Dataset]
    Dataset --> Replay[Replay Engine]
    Replay --> Visible[Visible Data]
    Visible --> Indicator[Indicator Engine]
    Indicator --> Values[Indicator Values]
    Values --> Chart[Chart]

    Dataset --> Future[Future Candles]
    Future --> Blocked[Blocked]
```

For replay index `N`:

``` python
visible_data = dataset[:N + 1]
result = indicator.calculate(visible_data)
```

------------------------------------------------------------------------

# 43. Drawing Engine

The drawing engine is independent from Lightweight Charts.

``` mermaid
flowchart TB
    DrawingManager[Drawing Manager]
    DrawingManager --> Registry[Tool Registry]
    DrawingManager --> Selection[Selection Manager]
    DrawingManager --> HitTest[Hit Testing]
    DrawingManager --> Geometry[Geometry Engine]
    DrawingManager --> Renderer[Drawing Renderer]
    DrawingManager --> Serializer[Serializer]

    Registry --> Basic[Basic Tools]
    Registry --> Fib[Fibonacci Tools]
    Registry --> Channels[Channels]
    Registry --> Advanced[Advanced Tools]
    Registry --> Annotation[Annotations]
```

------------------------------------------------------------------------

# 44. Drawing Tool Interface

``` typescript
interface DrawingTool {
    id: string;
    type: DrawingType;

    onPointerDown(event: PointerEvent): void;
    onPointerMove(event: PointerEvent): void;
    onPointerUp(event: PointerEvent): void;

    render(): void;

    hitTest(x: number, y: number): boolean;

    move(dx: number, dy: number): void;

    resize(handleId: string, x: number, y: number): void;

    serialize(): DrawingDefinition;
}
```

------------------------------------------------------------------------

# 45. Drawing Tool Categories

## Basic

``` text
Cursor
Crosshair
Trend Line
Ray
Extended Line
Horizontal Line
Vertical Line
Arrow
```

## Shapes

``` text
Rectangle
Ellipse
Circle
Triangle
Polygon
Polyline
```

## Fibonacci

``` text
Retracement
Extension
Projection
Channel
Time Zones
```

## Channels

``` text
Parallel Channel
Regression Channel
Equidistant Channel
```

## Advanced

``` text
Pitchfork
Schiff Pitchfork
Modified Schiff
Gann Fan
Gann Box
XABCD
Head & Shoulders
Elliott Wave
```

## Annotation

``` text
Text
Callout
Arrow
Price Label
Date Label
```

## Measurement

``` text
Price Range
Date Range
Bars Count
Percentage
Pips
Points
ATR Distance
```

------------------------------------------------------------------------

# 46. Drawing Interaction State Machine

``` mermaid
stateDiagram-v2
    [*] --> IDLE

    IDLE --> TOOL_SELECTED: select tool
    TOOL_SELECTED --> DRAWING: pointer down
    DRAWING --> DRAWING: pointer move
    DRAWING --> SELECTED: pointer up

    SELECTED --> MOVING: drag
    MOVING --> SELECTED: release

    SELECTED --> EDITING: select handle
    EDITING --> SELECTED: release

    SELECTED --> IDLE: deselect
    SELECTED --> DELETED: delete

    DELETED --> IDLE
```

------------------------------------------------------------------------

# 47. Drawing Coordinate System

Never persist drawings using pixel coordinates.

Use:

``` text
timestamp
price
```

The coordinate pipeline:

``` mermaid
flowchart LR
    Mouse[Mouse Screen X/Y]
    Mouse --> PixelToChart[Pixel → Chart]
    PixelToChart --> TimePrice[Timestamp + Price]
    TimePrice --> Geometry[Drawing Geometry]
    Geometry --> ChartToPixel[Chart → Pixel]
    ChartToPixel --> Render[Screen Rendering]
```

This allows drawings to survive:

-   zoom
-   pan
-   resize
-   timeframe changes where meaningful
-   session restoration

------------------------------------------------------------------------

# 48. Trend Line

Definition:

``` json
{
  "type": "trend_line",
  "points": [
    {
      "timestamp": 1750003200,
      "price": 1.085
    },
    {
      "timestamp": 1750103200,
      "price": 1.105
    }
  ],
  "style": {
    "width": 2,
    "lineStyle": "solid"
  }
}
```

------------------------------------------------------------------------

# 49. Fibonacci Retracement

Default levels:

``` text
0%
23.6%
38.2%
50%
61.8%
78.6%
100%
```

Requirements:

-   custom levels
-   reverse mode
-   labels
-   visibility
-   line style
-   extension
-   level selection
-   editable anchors

For upward movement:

``` text
level = high - (high - low) * ratio
```

------------------------------------------------------------------------

# 50. Fibonacci Architecture

``` mermaid
flowchart TD
    PointA[Anchor A]
    PointB[Anchor B]

    PointA --> Range[Calculate Price Range]
    PointB --> Range

    Range --> Levels[Calculate Fibonacci Levels]

    Levels --> L0[0%]
    Levels --> L236[23.6%]
    Levels --> L382[38.2%]
    Levels --> L50[50%]
    Levels --> L618[61.8%]
    Levels --> L786[78.6%]
    Levels --> L100[100%]

    L0 --> Render[Render Levels]
    L236 --> Render
    L382 --> Render
    L50 --> Render
    L618 --> Render
    L786 --> Render
    L100 --> Render
```

------------------------------------------------------------------------

# 51. Drawing Persistence

Drawings must be stored as geometry and metadata.

``` mermaid
sequenceDiagram
    participant User
    participant DrawingEngine
    participant Serializer
    participant Bridge
    participant Python
    participant SQLite

    User->>DrawingEngine: Create drawing
    DrawingEngine->>Serializer: Serialize
    Serializer->>Bridge: drawing.created
    Bridge->>Python: Save drawing
    Python->>SQLite: Store definition
    SQLite-->>Python: Saved
    Python-->>Bridge: Confirmation
```

------------------------------------------------------------------------

# 52. Drawing Definition

``` json
{
  "id": "drawing-123",
  "symbol": "EURUSD",
  "timeframe": "1H",
  "type": "trend_line",
  "points": [
    {
      "timestamp": 1750003200,
      "price": 1.085
    },
    {
      "timestamp": 1750103200,
      "price": 1.105
    }
  ],
  "style": {
    "width": 2,
    "lineStyle": "solid"
  },
  "locked": false,
  "visible": true
}
```

------------------------------------------------------------------------

# 53. Session Architecture

A replay session contains:

``` text
symbol
timeframe
dataset_id
dataset_version
replay_start
current_index
replay_end
speed
indicators
indicator settings
drawings
chart settings
theme
watchlist
workspace layout
```

``` mermaid
flowchart TB
    Session[Replay Session]
    Session --> Dataset[Dataset Reference]
    Session --> ReplayState[Replay State]
    Session --> Indicators[Indicators]
    Session --> Drawings[Drawings]
    Session --> ChartSettings[Chart Settings]
    Session --> Workspace[Workspace]
    Session --> Watchlist[Watchlist]
```

------------------------------------------------------------------------

# 54. Session Save / Restore

``` mermaid
sequenceDiagram
    participant User
    participant App
    participant SessionManager
    participant Storage

    User->>App: Save Session
    App->>SessionManager: Serialize state
    SessionManager->>Storage: Save
    Storage-->>SessionManager: Success
    SessionManager-->>App: Saved

    User->>App: Open Session
    App->>SessionManager: Load
    SessionManager->>Storage: Read
    Storage-->>SessionManager: Session
    SessionManager->>App: Restore
```

------------------------------------------------------------------------

# 55. Dataset Versioning

Normalized datasets should be versioned.

``` mermaid
flowchart TD
    Raw[Raw Provider Data]
    Raw --> V1[Normalized Version 1]
    Raw --> V2[Normalized Version 2]
    Raw --> V3[Normalized Version 3]

    V1 --> Session1[Session references V1]
    V2 --> Session2[Session references V2]
    V3 --> Session3[Session references V3]
```

A saved session must not silently change when a dataset is replaced.

------------------------------------------------------------------------

# 56. Main UI

``` text
┌──────────────────────────────────────────────────────────────────────────┐
│ File  View  Chart  Indicators  Drawings  Replay  Settings                │
├──────────────┬───────────────────────────────────────────────────────────┤
│ WATCHLIST    │ EURUSD    1H     DATA: READY                             │
│              ├───────────────────────────────────────────────────────────┤
│ ★ EURUSD     │                                                           │
│ ★ XAUUSD     │                     PRICE CHART                           │
│ ★ NIFTY      │                                                           │
│   GBPUSD     │                                                           │
│   USDJPY     │                                                           │
│   BTCUSDT    │                                                           │
│              ├───────────────────────────────────────────────────────────┤
│              │                          RSI                              │
│              ├───────────────────────────────────────────────────────────┤
│              │                        VOLUME                             │
├──────────────┴───────────────────────────────────────────────────────────┤
│ ◀ │ ▶ │ ▶▶ │ 0.5x │ 1x │ 2x │ 5x │ 10x │ 2025-08-05 14:00              │
└──────────────────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 57. Toolbar Architecture

``` mermaid
flowchart LR
    Toolbar[Drawing Toolbar]
    Toolbar --> Cursor[Cursor]
    Toolbar --> Lines[Lines]
    Toolbar --> Shapes[Shapes]
    Toolbar --> Fibonacci[Fibonacci]
    Toolbar --> Channels[Channels]
    Toolbar --> Advanced[Advanced]
    Toolbar --> Annotation[Annotation]
    Toolbar --> Measure[Measurement]
    Toolbar --> Delete[Delete]
```

------------------------------------------------------------------------

# 58. Automatic Download UX

Example:

``` text
┌─────────────────────────────────────────────┐
│ Historical Data                             │
│                                             │
│ EURUSD · 1H                                 │
│                                             │
│ Local dataset missing.                      │
│                                             │
│ Provider: Dukascopy                         │
│ Fallback: Yahoo                             │
│ Range: maximum available                    │
│                                             │
│ Downloading...                              │
│ ███████████████████░░ 91%                   │
│                                             │
│ Downloaded: 1,284,532 candles               │
│                                             │
│ ✓ Download                                  │
│ ✓ Normalize                                 │
│ ✓ Validate                                  │
│ → Storing                                    │
└─────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 59. Data Status UI

Possible states:

``` text
MISSING
DOWNLOADING
PROCESSING
VALIDATING
READY
STALE
FAILED
```

Example:

``` text
EURUSD · 1H
● READY
2003-01-01 → 2026-08-09
1,284,532 candles
```

------------------------------------------------------------------------

# 60. Progress Events

Python should emit structured events.

Example:

``` json
{
  "event": "download.progress",
  "job_id": "abc",
  "symbol": "EURUSD",
  "timeframe": "1H",
  "percent": 72.4,
  "rows": 920000
}
```

Other events:

``` text
download.started
download.progress
download.completed
download.failed

dataset.missing
dataset.ready
dataset.invalid
dataset.updated

replay.created
replay.started
replay.paused
replay.candle
replay.finished

drawing.created
drawing.updated
drawing.deleted

session.saved
session.loaded
```

------------------------------------------------------------------------

# 61. QWebChannel Architecture

The bridge should expose explicit commands.

``` mermaid
flowchart TB
    JS[TypeScript Frontend]
    Bridge[QWebChannel]

    Bridge --> SymbolCommands[Symbol Commands]
    Bridge --> DataCommands[Data Commands]
    Bridge --> ReplayCommands[Replay Commands]
    Bridge --> IndicatorCommands[Indicator Commands]
    Bridge --> SessionCommands[Session Commands]

    SymbolCommands --> Python[Python Core]
    DataCommands --> Python
    ReplayCommands --> Python
    IndicatorCommands --> Python
    SessionCommands --> Python
```

Never expose arbitrary Python execution.

Forbidden:

``` text
eval()
exec()
arbitrary module loading
arbitrary shell execution
arbitrary filesystem access
```

------------------------------------------------------------------------

# 62. Bridge Contract

Example:

``` typescript
interface PythonBridge {
    searchSymbols(query: string): Promise<Symbol[]>;

    requestDataset(
        request: DatasetRequest
    ): Promise<DatasetInfo>;

    loadHistory(
        request: HistoryRequest
    ): Promise<Candle[]>;

    createReplay(
        request: ReplayRequest
    ): Promise<ReplayState>;

    replayNext(): Promise<Candle>;

    replayPrevious(): Promise<Candle>;

    playReplay(): Promise<void>;

    pauseReplay(): Promise<void>;

    saveSession(
        session: Session
    ): Promise<void>;

    loadSession(
        id: string
    ): Promise<Session>;
}
```

------------------------------------------------------------------------

# 63. Event-Based Replay Bridge

Do not send the entire dataset on every candle.

``` mermaid
sequenceDiagram
    participant Replay
    participant Bridge
    participant JS
    participant Chart

    Replay->>Bridge: replay.candle
    Bridge->>JS: Candle event
    JS->>Chart: series.update(candle)
    Chart-->>JS: Render
```

Initial load can send a batch.

Replay should then send incremental updates.

------------------------------------------------------------------------

# 64. Performance Architecture

Goals:

-   smooth scrolling
-   smooth zoom
-   low replay latency
-   responsive UI
-   no blocking during downloads
-   efficient large datasets
-   minimal bridge traffic
-   bounded memory

``` mermaid
flowchart TB
    Dataset[Large Dataset]
    Dataset --> Parquet[Parquet]
    Parquet --> Lazy[Lazy Loading]
    Lazy --> Window[Required Data Window]
    Window --> Python[Python Processing]
    Python --> Bridge[Small Bridge Messages]
    Bridge --> TypeScript[TypeScript]
    TypeScript --> Chart[Lightweight Charts]
```

------------------------------------------------------------------------

# 65. Large Dataset Strategy

Do not automatically load every candle into memory.

Use:

``` text
Parquet
↓
Lazy read
↓
Requested date range
↓
Required columns
↓
Replay window
↓
Chart
```

Example:

``` text
Dataset:
10,000,000 candles

Chart:
~2,000 visible candles

Replay:
warmup + current visible window

Future:
hidden
```

------------------------------------------------------------------------

# 66. Cache Architecture

``` mermaid
flowchart LR
    Provider[Free Provider]
    Provider --> RawCache[Raw Cache]
    RawCache --> Normalized[Normalized Cache]
    Normalized --> Memory[Memory Cache]
    Memory --> Chart[Chart]
```

Cache key:

``` text
provider
symbol
timeframe
start
end
dataset_version
```

------------------------------------------------------------------------

# 67. Memory Management

Avoid repeatedly copying entire datasets.

Prefer:

-   lazy loading
-   slices/views
-   columnar storage
-   bounded caches
-   incremental updates
-   immutable dataset references
-   explicit cache eviction

------------------------------------------------------------------------

# 68. Multi-Chart Workspace

Future layout support:

``` text
1 chart
2 charts
4 charts
6 charts
```

``` mermaid
flowchart TB
    Workspace[Workspace]
    Workspace --> Chart1[Chart 1]
    Workspace --> Chart2[Chart 2]
    Workspace --> Chart3[Chart 3]
    Workspace --> Chart4[Chart 4]
```

Potential synchronized workspace:

``` text
EURUSD 1H
EURUSD 15m
EURUSD 5m
XAUUSD 1H
```

------------------------------------------------------------------------

# 69. Multi-Timeframe Replay

Future feature:

``` text
1H master replay
    ↓
15m synchronized
    ↓
5m synchronized
```

``` mermaid
flowchart TD
    Master[Master Replay Clock]
    Master --> H1[1H]
    Master --> M15[15m]
    Master --> M5[5m]
    Master --> Indicators[Indicators]
```

------------------------------------------------------------------------

# 70. Trade Simulation Layer

Trading simulation must remain separate from chart rendering.

``` mermaid
flowchart TB
    Replay[Replay Engine]
    Replay --> MarketState[Market State]
    MarketState --> OrderEngine[Order Simulation]
    OrderEngine --> Position[Position Manager]
    Position --> PnL[PnL Engine]
    PnL --> Journal[Trade Journal]
```

Future features:

-   market orders
-   limit orders
-   stop orders
-   stop loss
-   take profit
-   trailing stop
-   spread
-   slippage
-   commission
-   position sizing
-   leverage
-   margin
-   balance
-   risk management

------------------------------------------------------------------------

# 71. Strategy Testing Layer

Future:

``` mermaid
flowchart LR
    Replay[Replay]
    Replay --> Strategy[Strategy]
    Strategy --> Signal[Signal]
    Signal --> Orders[Order Simulation]
    Orders --> Position[Position]
    Position --> PnL[PnL]
```

The strategy must only receive replay-visible data.

------------------------------------------------------------------------

# 72. End-to-End System Flow

``` mermaid
flowchart TD
    User[User]
    User --> Search[Search Symbol]
    Search --> TF[Select Timeframe]
    TF --> Range[Select Historical Range]

    Range --> Registry[Check Dataset Registry]
    Registry --> Ready{Data Ready?}

    Ready -->|Yes| Load[Load Local Dataset]
    Ready -->|No| Provider[Resolve Free Provider]

    Provider --> Download[Download]
    Download --> Raw[Raw Cache]
    Raw --> Normalize[Normalize]
    Normalize --> Validate[Validate]

    Validate --> Valid{Valid?}
    Valid -->|No| Retry[Retry / Alternate Provider]
    Retry --> Download

    Valid -->|Yes| Store[Parquet]
    Store --> Register[Update Registry]
    Register --> Load

    Load --> ReplayConfig[Configure Replay]
    ReplayConfig --> Replay[Replay Engine]

    Replay --> Visible[Replay-visible Candles]
    Visible --> Indicators[Indicators]
    Visible --> Chart[Lightweight Charts]

    Chart --> Drawings[Drawing Engine]
    Replay --> Session[Session Manager]
    Indicators --> Session
    Drawings --> Session

    Session --> Save[Save Session]
```

------------------------------------------------------------------------

# 73. Complete User Journey

``` mermaid
sequenceDiagram
    participant U as User
    participant UI
    participant Python
    participant Registry
    participant Provider
    participant Storage
    participant Replay
    participant Bridge
    participant Chart
    participant Draw

    U->>UI: Search EURUSD
    UI->>Python: search_symbols("EURUSD")
    Python->>Registry: Search
    Registry-->>Python: Symbols
    Python-->>UI: Results

    U->>UI: Select EURUSD
    U->>UI: Select 1H

    UI->>Python: request_dataset(EURUSD, 1H)
    Python->>Storage: Check coverage

    alt Dataset missing
        Python->>Provider: Download
        Provider-->>Python: Raw data
        Python->>Python: Normalize
        Python->>Python: Validate
        Python->>Storage: Save Parquet
    else Dataset available
        Storage-->>Python: Existing dataset
    end

    Python->>Replay: Create replay
    Replay-->>Python: Replay state

    Python->>Bridge: Initial candles
    Bridge->>Chart: Render

    U->>UI: Play
    UI->>Python: play()
    Python->>Replay: advance()
    Replay->>Bridge: New candle
    Bridge->>Chart: update()

    U->>Draw: Create trendline
    Draw->>Draw: Store timestamp/price

    U->>UI: Save session
    UI->>Python: save_session()
    Python->>Storage: Save
```

------------------------------------------------------------------------

# 74. Error Handling

Error classes:

``` text
DataProviderError
ProviderRateLimitError
ProviderUnavailableError
DownloadError
NormalizationError
ValidationError
DatasetNotFoundError
DatasetCoverageError
ReplayError
IndicatorError
DrawingError
SessionError
BridgeError
```

``` mermaid
flowchart TD
    Operation[Operation]
    Operation --> Execute[Execute]
    Execute --> Success{Success?}

    Success -->|Yes| Done[Complete]
    Success -->|No| Classify[Classify Error]

    Classify --> Retryable{Retryable?}

    Retryable -->|Yes| Retry[Retry / Backoff]
    Retry --> Execute

    Retryable -->|No| Alternate{Alternate Provider?}

    Alternate -->|Yes| Provider[Try Another Free Provider]
    Provider --> Execute

    Alternate -->|No| UserError[Show User Error]
```

------------------------------------------------------------------------

# 75. Provider Failure Strategy

Example:

``` text
Dukascopy unavailable
        ↓
Try Yahoo
        ↓
Yahoo unavailable
        ↓
Try another compatible source
        ↓
No source
        ↓
Explain exactly why data cannot be acquired
```

The application should never silently substitute a materially different
instrument.

------------------------------------------------------------------------

# 76. Logging

Structured logs:

``` text
2026-08-09 14:32:10 INFO dataset.request symbol=EURUSD timeframe=1H
2026-08-09 14:32:10 INFO dataset.cache_miss
2026-08-09 14:32:11 INFO provider.selected provider=dukascopy
2026-08-09 14:32:11 INFO download.started
2026-08-09 14:33:42 INFO download.completed rows=1284532
2026-08-09 14:33:43 INFO validation.completed status=valid
2026-08-09 14:33:44 INFO dataset.ready
```

------------------------------------------------------------------------

# 77. Security

Even though this is local software:

-   never expose arbitrary Python methods
-   validate bridge inputs
-   validate file paths
-   restrict import directories
-   sanitize imported sessions
-   never execute downloaded files
-   validate external data
-   protect against malformed JSON
-   protect against resource exhaustion
-   use bounded queues

------------------------------------------------------------------------

# 78. Data Integrity

Every normalized dataset should include:

``` text
checksum
row_count
start_timestamp
end_timestamp
symbol
timeframe
provider
schema_version
dataset_version
created_at
```

------------------------------------------------------------------------

# 79. Testing Strategy

## Python

Test:

-   provider adapters
-   provider fallback
-   rate limiting
-   symbol resolution
-   normalization
-   timezone conversion
-   timeframe aggregation
-   validation
-   gap detection
-   dataset coverage
-   replay boundaries
-   indicator calculations
-   session serialization

## TypeScript

Test:

-   chart initialization
-   coordinate conversion
-   drawing geometry
-   hit testing
-   drawing serialization
-   toolbar
-   replay controls
-   viewport synchronization
-   indicator rendering

------------------------------------------------------------------------

# 80. Critical Replay Tests

### Test 1 --- Future data hidden

``` text
current_index = 100

visible length = 101
future data must not reach chart
```

### Test 2 --- Indicator safety

``` text
indicator.calculate(data[:current_index + 1])
```

### Test 3 --- Next candle

``` text
N → N+1
```

### Test 4 --- Previous candle

``` text
N → N-1
```

### Test 5 --- End

``` text
N == end
→ FINISHED
```

### Test 6 --- Reset

``` text
reset()
→ start_index
```

### Test 7 --- Random replay

``` text
random start must be inside valid replay range
```

### Test 8 --- Dataset version

``` text
session.dataset_version == loaded_dataset.version
```

------------------------------------------------------------------------

# 81. Drawing Tests

Every drawing must test:

``` text
creation
rendering
hit testing
movement
resizing
serialization
deserialization
deletion
visibility
locking
```

``` mermaid
flowchart LR
    Create[Create Drawing]
    Create --> Render[Render]
    Render --> Hit[Hit Test]
    Hit --> Move[Move]
    Move --> Resize[Resize]
    Resize --> Serialize[Serialize]
    Serialize --> Restore[Restore]
    Restore --> Compare[Compare Geometry]
```

------------------------------------------------------------------------

# 82. MVP

The MVP is complete when this workflow works:

``` text
Search EURUSD
      ↓
Select 1H
      ↓
Check local dataset
      ↓
Automatically download if missing
      ↓
Normalize
      ↓
Validate
      ↓
Store Parquet
      ↓
Open Lightweight Chart
      ↓
Replay
      ↓
Play/Pause
      ↓
Step candle
      ↓
Add trendline
      ↓
Save session
      ↓
Restore session
```

------------------------------------------------------------------------

# 83. Development Phases

## Phase 1 --- Foundation

Build:

-   PySide6 window
-   QWebEngineView
-   TypeScript application
-   QWebChannel
-   Lightweight Charts
-   configuration
-   logging

Deliverable:

``` text
Empty interactive chart application.
```

------------------------------------------------------------------------

## Phase 2 --- Data Layer

Build:

-   symbol models
-   provider interface
-   provider registry
-   free provider adapters
-   provider fallback
-   downloader
-   rate limiting
-   normalization
-   validation
-   Parquet
-   SQLite registry

Deliverable:

``` text
Search symbol → acquire historical data → store locally.
```

------------------------------------------------------------------------

## Phase 3 --- Chart

Build:

-   candlesticks
-   volume
-   crosshair
-   zoom
-   pan
-   time scale
-   price scale
-   timeframe selector

Deliverable:

``` text
Interactive historical chart.
```

------------------------------------------------------------------------

## Phase 4 --- Replay

Build:

-   replay state
-   replay clock
-   play/pause
-   next/previous candle
-   speed
-   jump-to-date
-   random replay
-   future-data isolation

Deliverable:

``` text
Historical candles replay safely.
```

------------------------------------------------------------------------

## Phase 5 --- Indicators

Build:

-   SMA
-   EMA
-   RSI
-   MACD
-   ATR
-   Bollinger Bands
-   VWAP
-   volume indicators

Deliverable:

``` text
Replay-aware technical analysis.
```

------------------------------------------------------------------------

## Phase 6 --- Drawing Engine

Build:

-   drawing registry
-   coordinate conversion
-   hit testing
-   selection
-   movement
-   resizing
-   deletion
-   persistence

Implement first:

``` text
Trendline
Ray
Horizontal
Vertical
Rectangle
Ellipse
Text
Arrow
```

------------------------------------------------------------------------

## Phase 7 --- Advanced Drawings

Implement:

``` text
Fibonacci
Channels
Pitchfork
Gann
Pattern tools
Measurement tools
```

------------------------------------------------------------------------

## Phase 8 --- Sessions

Build:

-   save
-   load
-   autosave
-   dataset versioning
-   drawing persistence
-   indicator persistence
-   replay position persistence

------------------------------------------------------------------------

## Phase 9 --- Workspace

Build:

-   watchlist
-   multiple charts
-   layouts
-   synchronized charts
-   templates

------------------------------------------------------------------------

## Phase 10 --- Trade Simulation

Build:

-   orders
-   positions
-   PnL
-   commission
-   spread
-   slippage
-   risk
-   journal

------------------------------------------------------------------------

# 84. Definition of Done

## Data

-   [ ] Symbol search works
-   [ ] Canonical symbol resolution works
-   [ ] Multiple free providers supported
-   [ ] Provider fallback works
-   [ ] Rate limiting works
-   [ ] Missing datasets download automatically
-   [ ] Existing datasets are reused
-   [ ] Partial coverage is detected
-   [ ] Only missing ranges are downloaded
-   [ ] Data is normalized
-   [ ] Data is validated
-   [ ] Data is stored in Parquet
-   [ ] Dataset metadata is stored in SQLite
-   [ ] Dataset versions are tracked

## Chart

-   [ ] Candles render
-   [ ] Volume renders
-   [ ] Crosshair works
-   [ ] Zoom works
-   [ ] Pan works
-   [ ] Timeframe selection works
-   [ ] Chart resizing works
-   [ ] Visible-range changes work

## Replay

-   [ ] Start replay
-   [ ] Pause
-   [ ] Resume
-   [ ] Next candle
-   [ ] Previous candle
-   [ ] Speed control
-   [ ] Jump to date
-   [ ] Random replay
-   [ ] Future candles are blocked
-   [ ] Replay reaches end safely

## Indicators

-   [ ] SMA
-   [ ] EMA
-   [ ] RSI
-   [ ] MACD
-   [ ] ATR
-   [ ] Bollinger Bands
-   [ ] VWAP
-   [ ] Replay-aware calculations

## Drawings

-   [ ] Cursor
-   [ ] Trendline
-   [ ] Ray
-   [ ] Horizontal line
-   [ ] Vertical line
-   [ ] Rectangle
-   [ ] Ellipse
-   [ ] Text
-   [ ] Arrow
-   [ ] Fibonacci
-   [ ] Channels
-   [ ] Hit testing
-   [ ] Move
-   [ ] Resize
-   [ ] Delete
-   [ ] Lock
-   [ ] Visibility
-   [ ] Serialize
-   [ ] Restore

## Sessions

-   [ ] Save
-   [ ] Load
-   [ ] Autosave
-   [ ] Dataset version tracking
-   [ ] Drawing restoration
-   [ ] Indicator restoration
-   [ ] Replay restoration

------------------------------------------------------------------------

# 85. Architectural Rules

## Rule 1 --- Replay owns time

The chart never decides which candle is current.

## Rule 2 --- Data layer owns data

The chart never downloads market data.

## Rule 3 --- Provider layer owns provider-specific behavior

No provider-specific parsing should leak into replay or chart code.

## Rule 4 --- Drawings are independent objects

Never hard-code drawing logic into candle rendering.

## Rule 5 --- Indicators see replay-visible data only

No future candles.

## Rule 6 --- Sessions reference dataset versions

Never silently substitute a different dataset.

## Rule 7 --- Parquet is primary storage

CSV is an export/interchange format.

## Rule 8 --- Free APIs are replaceable

The application must not depend permanently on one free provider.

## Rule 9 --- No paid API is required

The core application must remain functional using free/public sources.

## Rule 10 --- No application API server

Use QWebChannel for Python ↔ TypeScript communication.

## Rule 11 --- Python computes, TypeScript renders

Keep high-frequency mouse/rendering work inside the frontend.

## Rule 12 --- Explicit bridge commands only

Never expose arbitrary Python execution to JavaScript.

------------------------------------------------------------------------

# 86. Final Architecture

``` mermaid
flowchart TB
    User[TRADER]

    subgraph Desktop["Standalone Desktop Application"]
        UI[PySide6 UI]
        Search[Symbol Search]
        Watchlist[Watchlist]
        Toolbar[Drawing Toolbar]
        ReplayControls[Replay Controls]

        subgraph TS["TypeScript Visualization"]
            LWC[Lightweight Charts]
            Draw[Drawing Engine]
            Crosshair[Crosshair]
            Viewport[Viewport Manager]
            IndicatorView[Indicator Rendering]
        end

        subgraph Bridge["Local IPC"]
            QWC[QWebChannel]
        end

        subgraph Python["Python Core"]
            SymbolRegistry[Symbol Registry]
            ProviderRegistry[Provider Registry]
            Downloader[Download Manager]
            RateLimiter[Rate Limiter]
            Normalizer[Normalizer]
            Validator[Validator]
            ReplayEngine[Replay Engine]
            IndicatorEngine[Indicator Engine]
            SessionManager[Session Manager]
        end
    end

    subgraph Storage["Local Storage"]
        Raw[(Raw Cache)]
        Parquet[(Parquet)]
        SQLite[(SQLite)]
        Sessions[(Sessions)]
    end

    subgraph Internet["Free / Public Data Sources"]
        Yahoo[Yahoo]
        Dukascopy[Dukascopy]
        NSE[NSE-compatible]
        Binance[Binance]
        Other[Other Free Sources]
    end

    User --> UI
    UI --> Search
    UI --> Watchlist
    UI --> Toolbar
    UI --> ReplayControls

    Search --> QWC
    Watchlist --> QWC
    ReplayControls --> QWC

    QWC <--> SymbolRegistry
    QWC <--> ProviderRegistry
    QWC <--> ReplayEngine
    QWC <--> IndicatorEngine
    QWC <--> SessionManager

    ProviderRegistry --> Downloader
    Downloader --> RateLimiter
    RateLimiter --> Yahoo
    RateLimiter --> Dukascopy
    RateLimiter --> NSE
    RateLimiter --> Binance
    RateLimiter --> Other

    Downloader --> Raw
    Raw --> Normalizer
    Normalizer --> Validator
    Validator --> Parquet
    Validator --> SQLite

    Parquet --> ReplayEngine
    ReplayEngine --> IndicatorEngine
    ReplayEngine --> SessionManager

    SessionManager --> SQLite
    SessionManager --> Sessions

    QWC <--> LWC
    QWC <--> Draw
    QWC <--> IndicatorView

    LWC --> Crosshair
    LWC --> Viewport
    Draw --> LWC
```

------------------------------------------------------------------------

# 87. Final Product Flow

``` mermaid
flowchart TD
    Search[SEARCH SYMBOL]
    Search --> Select[SELECT TIMEFRAME]
    Select --> Range[SELECT RANGE]

    Range --> Check[CHECK LOCAL DATA]

    Check --> Local{LOCAL DATA AVAILABLE?}

    Local -->|YES| Load[LOAD DATA]
    Local -->|NO| FreeProvider[SELECT FREE PROVIDER]

    FreeProvider --> Download[DOWNLOAD]
    Download --> Normalize[NORMALIZE]
    Normalize --> Validate[VALIDATE]
    Validate --> Store[STORE PARQUET]
    Store --> Load

    Load --> Chart[LIGHTWEIGHT CHART]
    Chart --> Replay[HISTORICAL REPLAY]

    Replay --> Indicators[INDICATORS]
    Replay --> Drawings[DRAWINGS]
    Replay --> Session[SESSION]

    Indicators --> Session
    Drawings --> Session

    Session --> Restore[RESTORE LATER]
```

------------------------------------------------------------------------

# 88. Product Goal

The finished application should feel like a standalone professional
historical trading terminal:

``` text
SEARCH
   ↓
SYMBOL
   ↓
TIMEFRAME
   ↓
FREE DATA PROVIDER
   ↓
AUTOMATIC DOWNLOAD
   ↓
NORMALIZE
   ↓
VALIDATE
   ↓
LOCAL PARQUET
   ↓
LIGHTWEIGHT CHART
   ↓
REPLAY
   ↓
INDICATORS
   ↓
DRAWINGS
   ↓
SESSION
   ↓
OPTIONAL TRADE SIMULATION
```

The central architecture is:

> **Python is the market-data, replay, and calculation brain.
> TypeScript + Lightweight Charts is the visual trading terminal.
> QWebChannel is the local communication layer. Free/public data
> providers supply historical data, while Parquet becomes the canonical
> local dataset.**

This architecture avoids paid API dependencies while remaining
extensible enough to support multiple free data sources, advanced
drawing tools, replay-safe indicators, saved sessions, multi-chart
layouts, and future trade simulation.
