# ADR 0008: User Authentication and Paper Trade History System with Instant Demo Mode

- **Status**: Accepted
- **Date**: 2026-11-03
- **Context**: Trading Chart Replay Terminal (`tv_chart_replay`)
- **Deployment Targets**:
  - **Desktop:** Native PySide6 (Qt) Shell + In-Memory `QWebChannel` IPC (Local SQLite)
  - **Cloud (Web):** Vercel Static Edge SPA + Render.com FastAPI Backend (Cloud SQLite / PostgreSQL ready)
- **Related Documents**:
  - [ADR 0007: Dual Transport Architecture](file:///d:/code/tv_chart_replay/docs/adr/0007-dual-transport-architecture-qt-desktop-and-fastapi-cloud.md)
  - [User Auth & Paper Trade System Specification](file:///d:/code/tv_chart_replay/docs/USER_AUTH_AND_PAPER_TRADE_SYSTEM.md)
  - [Bridge Contract Specification](file:///d:/code/tv_chart_replay/docs/bridge-contract.md)

---

## 1. Context and Problem Statement

The Trading Chart Replayer currently runs in a single-session context where all paper trades and closed positions are committed to a global SQLite `trade_journal` table. As the platform transitions to a multi-user cloud web deployment (Vercel + Render.com) while maintaining local desktop capabilities:

1. **User Identity & Multi-Tenancy:** We need a user authentication system so multiple traders can create accounts, log in, manage their personal paper trading portfolio, and access their historical trade journal across browser sessions and devices.
2. **Preserve Default Guest Experience:** The application must **look normal as it does now by default**. Users landing on the web application must not be greeted with an obstructive login wall or forced signup modal. They should immediately be able to view charts, switch timeframes, replay candles, add technical indicators, and draw on the canvas.
3. **Gated Trade History vs. Instant Temporary Demo Preview:**
   - When a user decides to place an order (via Quick Trade bar or Order Panel):
     - If they wish to **store trade history**, an account is required (login or quick signup). All orders, fills, and journal logs are persisted under their unique `user_id`.
     - If they want an **instant demo preview** of paper trading, they can trade immediately without registering. In this mode, **no trade history is saved to the persistent database**; the session is entirely ephemeral (in-memory), allowing users to test order execution, risk calculations, and SL/TP behavior risk-free and friction-free.

---

## 2. Decision Drivers

- **Zero-Friction Default Landing:** Never block chart exploration, replay controls, or indicator tools behind an authentication gate. Unauthenticated guest browsing is the default state.
- **Explicit Order Placement Choice:** Clearly present the user with the option to either save their trading journal (requiring an account) or test paper trading via an instant, disposable demo session.
- **Strict Data Isolation for Demo Mode:** Guarantee that temporary demo trades never pollute the database or leak into authenticated user journals.
- **Dual Transport & Offline Compatibility:** The auth and user journal system must work seamlessly both in the cloud (FastAPI token-based auth) and on the desktop shell (PySide6 / local mode).
- **Zero Heavy External Dependencies:** Use standard cryptographic algorithms (PBKDF2-HMAC-SHA256 via Python `hashlib` or argon2) and SQLite/SQLAlchemy schemas without mandatory external paid identity providers (like Firebase or Auth0) that break offline desktop execution.

---

## 3. Evaluated Architectural Alternatives

### Alternative A: Dual-Mode Architecture with In-Memory Demo & SQLite-Backed User Journals (Selected)
- **Default State:** Guest user browsing with full replay and charting capabilities.
- **Order Trigger Interceptor:** Placing an order while unauthenticated displays an Exness/TradingView-styled modal:
  1. **Option 1 (Save History):** "Sign In / Register to track persistent trade history, analytics, and win rate."
  2. **Option 2 (Instant Demo Preview):** "Proceed in Demo Mode — no account required. Trades, positions, and journal exist strictly in temporary memory and are discarded on refresh."
- **Backend Architecture:**
  - `users` and `user_sessions` tables store credentials, tokens, and account balance configs.
  - `trade_journal` gains a foreign key `user_id` with composite indexes `(user_id, closed_at DESC)`.
  - For demo mode, the backend (or client fallback) executes trades through an ephemeral `DemoOrderEngine` that bypasses database writes entirely.
- *Pros:* Perfect user experience; zero friction; protects persistent storage from spam; works in both web and desktop environments.
- *Cons:* Requires maintaining ephemeral order state alongside persistent database repositories.

---

### Alternative B: Mandatory Registration Wall on App Load (Rejected)
Force every visitor to sign in or register before seeing the chart.
- *Why Rejected:* Violates the explicit requirement: *"by default it should be look normal as now"*. Massively increases bounce rate for prospective users who just want to test replay capabilities.

---

### Alternative C: Browser LocalStorage-Only Demo and Account System (Rejected)
Store all user credentials and trade history exclusively in browser `localStorage` or `IndexedDB`.
- *Why Rejected:* Highly fragile; data is lost if the user clears browser cookies/cache; trades do not sync across devices or browsers; provides no real multi-user security.

---

### Alternative D: Third-Party Identity SaaS (Auth0, Clerk, Firebase) (Rejected)
Outsource authentication entirely to a cloud SaaS provider.
- *Why Rejected:* Completely breaks offline desktop usage (`app/main.py`); introduces external subscription costs and vendor lock-in; complicates dual-transport synchronization with the Python core.

---

## 4. Decision: Dual-Mode Session with In-Memory Demo & SQLite-Backed Multi-Tenant Journal

We select **Alternative A**.

### 4.1 System Components & User States

```
                +-------------------------------------------------------+
                |                Default Landing Page                   |
                |  (Unauthenticated Guest: Chart, Replay, Indicators)   |
                +-------------------------------------------------------+
                                           |
                                [User Clicks Buy / Sell]
                                           |
                                           v
                        +-------------------------------------+
                        |   Paper Trading Mode Chooser Modal  |
                        +-------------------------------------+
                                   /                 \
                                  /                   \
                   [Choose "Save History"]      [Choose "Instant Demo"]
                                /                       \
                               v                         v
               +-----------------------------+   +-----------------------------+
               |   Login / Register Dialog   |   |     Temporary Demo Mode     |
               | (Email, Username, Password) |   |    (Ephemeral In-Memory)    |
               +-----------------------------+   +-----------------------------+
                               |                                 |
                               v                                 v
               +-----------------------------+   +-----------------------------+
               | Authenticated User Session  |   |  Volatile Paper Trading     |
               |  - User ID Token Attached   |   |  - Banner: "Demo (Unsaved)" |
               |  - Saved Trade History      |   |  - Unsaved Demo Trades      |
               |  - Multi-Device Sync        |   |  - Resets on Reload/Session |
               +-----------------------------+   +-----------------------------+
```

### 4.2 Database Schema Enhancements

1. **`users` Table:**
   - `id`: `TEXT PRIMARY KEY` (UUID string `usr_...`)
   - `username`: `TEXT NOT NULL UNIQUE` (case-insensitive alphanumeric)
   - `email`: `TEXT NOT NULL UNIQUE` (case-insensitive email)
   - `password_hash`: `TEXT NOT NULL` (PBKDF2-HMAC-SHA256 with 100,000 iterations and salt)
   - `salt`: `TEXT NOT NULL` (cryptographic random hex)
   - `initial_balance`: `REAL NOT NULL DEFAULT 10000.0`
   - `balance`: `REAL NOT NULL DEFAULT 10000.0`
   - `created_at`: `TEXT NOT NULL` (ISO UTC)
   - `last_login_at`: `TEXT`

2. **`user_sessions` Table:**
   - `token`: `TEXT PRIMARY KEY` (cryptographically secure bearer token)
   - `user_id`: `TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE`
   - `expires_at`: `INTEGER NOT NULL` (Unix epoch timestamp)
   - `created_at`: `TEXT NOT NULL`

3. **`trade_journal` Table (Updated Migration):**
   - Add `user_id`: `TEXT NOT NULL DEFAULT 'local_default'`
   - Add `session_id`: `TEXT` (optional grouping by trading session)
   - Foreign key constraint to `users(id)`
   - Composite Index: `idx_trade_journal_user_closed (user_id, closed_at DESC)`

### 4.3 Order Execution Engine Routing

- When an order request arrives:
  - If authenticated: `OrderEngine` executes the trade and commits closed entries to `TradeJournal` associated with `user_id`.
  - If demo mode: `DemoOrderEngine` (or `OrderEngine(persist=False)`) calculates fills, tracking, and SL/TP entirely in memory. When closed, it logs the trade to an in-memory ring buffer or frontend session state without writing any rows to SQLite.

---

## 5. User Interface Specifications

1. **Header Navigation User Widget (Top Right):**
   - **Guest State:** Clean `Sign In` button alongside existing controls (`Watchlist`, `Trade Panel`, `Logs`).
   - **Demo State:** Yellow/Amber status pill `[ 🧪 Demo Mode (Unsaved) ]` with quick action `Save History -> Sign In`.
   - **Authenticated State:** Blue status pill `[ 👤 <Username> | $10,250.00 ]` with dropdown:
     - Profile & Journal Analytics
     - Switch to Temporary Demo Sandbox
     - Reset Paper Account Balance
     - Sign Out

2. **Mode Selection Dialog (Triggered on First Unauthenticated Order):**
   - Styled using the TradingView Dark Theme (`#1e222d` card background, `#2962ff` brand accents, `#787b86` muted text).
   - Card A: **Track & Save History (Recommended)** — Highlighted with a feature list (Cloud sync, Journal PnL, Win rate metrics, Resume sessions). Direct button: "Sign In / Create Account".
   - Card B: **Instant Demo Preview** — Highlighted as a no-strings sandbox. Feature list (Immediate execution, Test SL/TP & Risk calculator, Zero data stored). Direct button: "Trade in Demo Mode".

3. **Login / Register Modal:**
   - Unified tabbed modal (`Log In` / `Sign Up`).
   - Clean, lightweight form: Username/Email, Password, Confirm Password (signup only).
   - Instant validation and error messaging (e.g. invalid credentials, username already taken).
   - On successful authentication, automatically completes the pending order that triggered the flow.

---

## 6. Security and Compliance

- Passwords hashed with PBKDF2-HMAC-SHA256 and unique 32-byte cryptographic salts.
- Session tokens generated via `secrets.token_urlsafe(32)`.
- All user-specific database queries parameterized to prevent SQL injection.
- Zero external tracking or unnecessary identity telemetry.

---

## 7. Consequences & Next Steps

### Positive Consequences
- Retains 100% of the existing user experience for casual visitors exploring the chart.
- Provides immediate paper trading access for testers without requiring tedious registration.
- Delivers robust, multi-tenant persistence for committed users who want real historical tracking.
- Maintains complete desktop shell offline capability.

### Neutral / Follow-up Requirements
- Implementation requires updating `TradeJournal` to be user-aware.
- Order execution handlers must respect the `persist` flag.
- Detailed implementation specifications and wireframes are documented in [USER_AUTH_AND_PAPER_TRADE_SYSTEM.md](file:///d:/code/tv_chart_replay/docs/USER_AUTH_AND_PAPER_TRADE_SYSTEM.md).

