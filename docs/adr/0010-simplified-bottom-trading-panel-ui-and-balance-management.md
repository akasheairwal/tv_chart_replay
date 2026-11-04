# ADR 0010: Simplified Bottom Trading Panel UI Architecture and Capital Management System

- **Status**: Proposed
- **Date**: 2026-11-04
- **Context**: Trading Chart Replay Terminal (`tv_chart_replay`)
- **Target Components**:
  - `frontend/src/ui/trading-drawer.ts`
  - `frontend/src/ui/capital-popover.ts` (New Popover Component)
  - `frontend/src/trading/trading-types.ts`
  - `frontend/src/style.css`
  - `app/trading/order_engine.py`
  - `app/bridge/commands.py`
  - `app/api/server.py`
- **Companion Specification**: [Simplified Bottom Panel Design Specification](file:///d:/code/tv_chart_replay/docs/simplified-bottom-panel-design.md)
- **Related ADRs**:
  - [ADR 0007: Dual Transport Architecture (Qt Desktop & FastAPI Cloud)](file:///d:/code/tv_chart_replay/docs/adr/0007-dual-transport-architecture-qt-desktop-and-fastapi-cloud.md)
  - [ADR 0008: User Authentication and Paper Trade History System](file:///d:/code/tv_chart_replay/docs/adr/0008-user-authentication-and-paper-trade-history-system.md)
  - [ADR 0009: Simplified Replay Bar UI Architecture](file:///d:/code/tv_chart_replay/docs/adr/0009-simplified-replay-bar-ui-architecture.md)

---

## 1. Context and Problem Statement

The Trading Chart Replayer features a bottom dock drawer (`.trading-drawer.exness-drawer` instantiated in `frontend/src/ui/trading-drawer.ts`) providing portfolio inspection, position lifecycle tracking, pending order management, closed trade journaling, and account balance telemetry.

While the existing implementation provides foundational paper trading visibility, practical day-to-day use in backtesting and replay workflows reveals several ergonomic, operational, and visual limitations:

### 1.1 Inflexible Capital Lifecycle (No Add Balance / Hidden Reset)

- **Zero In-Panel Deposit/Top-Up:** During strategy backtesting and paper replay, traders frequently evaluate portfolio drawdowns, test position sizing under varying capital bases, or simulate routine monthly account deposits. There is currently **no mechanism** anywhere in the bottom panel to deposit or add capital to the account.
- **Concealed Reset Control:** Resetting the account balance was previously buried inside the top navigation user avatar dropdown (`UserNavWidget`), requiring multiple clicks away from the chart, hardcoding a \$10,000 starting base, and relying on browser-native `window.confirm()` prompts. Traders inspecting their open positions and equity at the bottom of the screen cannot quickly re-baseline their account when a test run terminates or drawdowns exceed parameters.

### 1.2 Information Overload and Horizontal Clutter in Drawer Header

- **Monolithic Text Pill:** Account balance, equity, unrealized P&L, and open position summaries are rendered as a single monolithic string inside `.trading-account-pill`:
  `Balance: $10,000.00 | Equity: $10,000.00 | PnL: +$0.00 | Active: 2 Pos (1.50 Lots)`
- **Header Collisions on Standard Viewports:** When the user has both sidebars open (Watchlist at 280px and Trade Panel at 320px) on standard 1080p or 1440x900 displays, the horizontal space available for the bottom drawer drops to under 800px. The lengthy text pill clashes directly with the four tab headers, causing horizontal wrapping, truncated text, or clipping.
- **Absence of Tab Notification Badges:** Tabs currently display plain text (`Open Positions`, `Pending Orders`, `Trade Journal`, `Account Summary`) with zero indication of whether active positions or pending orders exist. A trader must manually click each tab to discover if orders are resting or positions remain open.

### 1.3 Cluttered Table Rows and Bulky Action Buttons

- **Excessive Action Footprint:** In the Open Positions table, actions are rendered as bulky text-and-emoji buttons (`🎯 SL/TP`, `✂️ Partial`, `✕ Close`), consuming substantial horizontal width (~220px per row) and disrupting the dark professional terminal aesthetic.
- **Missing Bulk Controls:** Traders managing multiple open positions or pending orders lack "Close All" or "Cancel All" macro operations, forcing tedious sequential manual closing.
- **Obscure Inline Editing:** While double-clicking SL/TP cells triggers modification, there is no subtle hover cue, edit icon, or affordance indicating that cells are editable.

### 1.4 Rigid Spatial Geometry

- The drawer has a fixed expanded height of 190px and collapsed height of 38px. When reviewing a trade journal with dozens of historical records, 190px displays only 3 to 4 rows before requiring vertical scrolling. Traders cannot drag-resize the panel or maximize it to conduct a deep trading performance post-mortem.

---

## 2. Decision Drivers

1. **Ergonomic Simplification & High Signal-to-Noise Ratio:** Clean, visual hierarchy with clear contrast, modern segmented tabs, and compact metric capsules aligned with TradingView and Exness WebTerminal paradigms.
2. **First-Class Capital Management:** Integrated `[+ Add Balance]` and `[↺ Reset Balance]` interactive triggers directly accessible in the bottom panel header and Account Summary tab, backed by lightweight anchored popovers with preset chips and custom amount inputs.
3. **Comprehensive Feature Preservation:** 100% preservation of all existing functionality:
   - Live position monitoring, double-click SL/TP editing, partial close dialog, and manual close.
   - Pending order tracking and cancellation.
   - Trade journal with Demo Session warning banner and auth modal trigger.
   - Account metrics (Equity, Margin Used, Free Margin, Margin Level %, Floating P&L).
   - Collapse/expand toggle state with chart canvas resizing.
4. **Viewport Resilience:** Responsive header layout that gracefully flexes between 600px and 2560px screen widths without visual overlap, utilizing collapsible metric chips on narrow screens.
5. **Fluid Vertical Resizability:** Drag-to-resize split handle along the panel's top edge, supporting snap-to-height presets (Collapsed 38px, Default 200px, Tall 380px, Maximize 80vh).
6. **Backend Contract Integrity:** Full compatibility with desktop `QWebChannel` PySide6 bridge, local SQLite database, and cloud FastAPI endpoints.

---

## 3. Evaluated Architectural Alternatives

### Alternative A: Modular Streamlined Dock with Anchored Capital Popovers & Drag-Resize (Selected)

- **Concept:** Keep the bottom panel docked beneath the chart, but comprehensively reorganize its header into three distinct zones:
  1. **Navigation Zone (Left):** Segmented pill tabs with live numerical badge counters (e.g., `Positions (2)`, `Orders (1)`, `Journal (14)`, `Summary`).
  2. **Financial Status Strip (Center):** Compact, discrete metric pills (`Balance`, `Equity`, `P&L` with real-time color styling and percentage yield).
  3. **Controls & Capital Management Zone (Right):** Prominent `[+ Add]` and `[↺ Reset]` buttons opening anchored popovers (reusing `popover-utils.ts`), a contextual bulk action button (`Close All` / `Cancel All`), a maximize/fullscreen button (`⛶`), and the collapse toggle.
- Add a 4px draggable resize boundary at the top edge of the drawer.
- Implement `AddBalancePopover` and `ResetBalancePopover` using the established viewport-aware popover positioning engine.
- _Pros:_ Eliminates clutter, solves capital management right where balances are viewed, provides rich responsive behavior, preserves 100% existing features and test contracts, and provides smooth drag-resizing.
- _Cons:_ Requires adding a drag-resize event handler and two popover views.

---

### Alternative B: Move Bottom Drawer to a Right-Hand Sidebar Tab (Rejected)

- **Concept:** Merge Open Positions, Orders, and Journal into the right-side Trade Panel as separate tabs.
- _Why Rejected:_ Highly problematic for financial data tables. Tabular financial data (Symbol, Side, Volume, Entry, Current, SL, TP, PnL, Actions) requires substantial horizontal width (minimum 700px). Cramming multi-column financial tables into a 320px vertical sidebar causes severe text truncation, horizontal scrollbars, and unreadable rows.

---

### Alternative C: Modal Dialogs for All Capital Adjustments (Rejected)

- **Concept:** Clicking Reset or Add balance opens full-screen centered modal overlays.
- _Why Rejected:_ Heavyweight and disruptive. Entering a quick deposit or resetting capital should be a 1-second inline interaction that does not obscure the chart candles or replay bar. Lightweight anchored popovers (matching the Replay Speed and Jump popovers from ADR 0009) provide far better flow.

---

## 4. Architectural Decision: The Simplified Bottom Trading Panel

We adopt **Alternative A**.

### 4.1 Component Decomposition and Layout Topology

```
+=============================================================================================================================+
| [--- 4px Draggable Top Resizer Handle ---]                                                             (.drawer-resizer)   |
+-----------------------------------------------------------------------------------------------------------------------------+
| TABS (Left)                     METRIC STRIP (Center)                        CAPITAL & ACTIONS (Right)                      |
| [📊 Positions (2)] [⏳ Orders (0)] |  Bal: $10,000.00   Eq: $10,450.00             |  [+ Add]  [↺ Reset]  [✕ Close All]   [⛶] [▾] |
| [📜 Journal (18)]  [💳 Summary]   |  P&L: +$450.00 (+4.5%)  Free: $9,800           |                                             |
+-----------------------------------------------------------------------------------------------------------------------------+
|                                                   ACTIVE TAB BODY CONTENT                                                   |
|                                                                                                                             |
|  - Open Positions Table: Monospace data, micro-action icon buttons (🎯 SL/TP, ✂️ Partial, ✕ Close)                          |
|  - Pending Orders Table: Clean price, type, SL/TP columns with Cancel button                                                |
|  - Trade Journal: Mini performance metrics header (Win Rate, Profit Factor, Net PnL) + tabular logs + Demo banner           |
|  - Account Summary: Interactive metric cards, live margin gauges, and capital management panel                              |
+=============================================================================================================================+
```

### 4.2 Capital Management Architecture

#### 4.2.1 "+ Add Balance" Workflow

1. User clicks `[+ Add]` (`#drawer-add-balance-btn`) in the drawer header or Account Summary tab.
2. An anchored popover (`.tv-capital-popover.add-balance-popup`) opens directly above the button:
   - **Quick Deposit Chips:** `+$500`, `+$1,000`, `+$5,000`, `+$10,000`, `+$50,000`.
   - **Custom Input:** Number input formatted with currency mask and increment steppers.
   - **Optional Note:** Short memo field (e.g., "Backtest top-up", "Deposit round 2").
   - **Action Buttons:** `[Cancel]` and `[Confirm Deposit]`.
3. On confirmation:
   - Desktop: Calls bridge command `addAccountBalance({ amount, note, is_demo })`.
   - Web / Cloud: Calls `POST /api/auth/add-balance` (with token) or updates ephemeral demo state.
   - Backend `OrderEngine.add_balance(amount)` increases `account.balance`, recalculates `equity` and `free_margin`, emits `trading.account`, and creates a journal audit entry.
   - Frontend displays success toast: `💰 Added $5,000.00 to Paper Account (New Balance: $15,000.00)`.

#### 4.2.2 "↺ Reset Balance" Workflow

1. User clicks `[↺ Reset]` (`#drawer-reset-balance-btn`) in the drawer header or Account Summary tab.
2. An anchored popover (`.tv-capital-popover.reset-balance-popup`) opens directly above the button:
   - **Target Starting Capital Chips:** `$1,000`, `$5,000`, `$10,000` (Default), `$25,000`, `$50,000`, `$100,000`.
   - **Custom Target Input:** Field to specify any arbitrary baseline (e.g. `$250,000` for prop firm simulation).
   - **History Preservation Checkbox:**
     - `[✓] Clear closed trade journal & reset win rate statistics` (default: unchecked — preserves history by default).
   - **Safety Confirmation:** Amber warning indicator: _"This will reset your paper balance to the selected starting capital."_
   - **Action Buttons:** `[Cancel]` and `[Reset Account]`.
3. On confirmation:
   - Desktop: Calls existing bridge command `resetAccount({ initial_balance, clear_journal, is_demo, user_id })`.
   - Web / Cloud: Calls existing `POST /api/auth/reset-account`.
   - Backend `OrderEngine.reset_account()` resets balance/equity, optionally wipes journal records if requested, and emits `trading.account` and `trading.positions`.
   - Frontend displays toast: `🔄 Paper Account Balance reset to $10,000.00`.

---

## 5. Detailed Component Specifications

### 5.1 Tab Navigation with Dynamic Counter Badges

- Replaces raw text buttons with structured buttons containing icon, label, and counter pill:
  ```html
  <button class="trading-tab active" data-tab="positions">
    <span class="tab-icon">${getIcon('trending_up')}</span>
    <span class="tab-label">Positions</span>
    <span class="tab-badge" id="badge-positions">0</span>
  </button>
  ```
- **Active Badges:**
  - `Positions`: Green badge when > 0 open positions.
  - `Orders`: Amber badge when > 0 pending orders.
  - `Journal`: Neutral badge showing total closed trades.
  - Badges update automatically upon position updates or journal refreshes.

### 5.2 Responsive Financial Status Strip

The center header section houses three responsive capsules:

1. **Balance & Equity Capsule:**
   - Label: `BAL $10,000.00` · `EQ $10,450.00`
   - Monospace, high contrast bright foreground.
2. **Floating P&L Capsule:**
   - Label: `+$450.00 (+4.50%)`
   - Dynamic class: `.pnl-green` (`#089981`) or `.pnl-red` (`#f23645`).
3. **Margin Capsule (Secondary):**
   - Label: `Free: $9,800.00 (98%)`
   - Automatically hides via CSS container queries or media queries when width < 900px to avoid squeezing tabs.

### 5.3 Micro-Action Button Cluster (Open Positions Table)

Replaces wide text buttons with unified, dark-themed micro-action icons:

- **SL/TP Targets:** Icon button (`target`) with tooltip `Modify SL/TP (Double-click cell also supported)`.
- **Partial Close:** Icon button (`scissors`) with tooltip `Partial Close Position`.
- **Close Position:** Icon button (`x`) with tooltip `Close Position at Market`.
- **Bulk Action:** Header button `[✕ Close All]` in the action bar, enabled only when open positions count > 1.

### 5.4 Drag-to-Resize Boundary & Vertical States

- A 4px resize rail (`.trading-drawer-resizer`) is positioned at the top edge with hover cursor `row-resize`.
- **Supported Heights:**
  - `Collapsed`: `38px` (Only header bar visible; chart expands to fill space).
  - `Default`: `200px` (Balanced view showing 4-5 table rows).
  - `Expanded`: `360px` (Detailed inspection showing 10+ rows).
  - `Maximized`: `calc(100vh - 120px)` (Full-screen view for extensive journal auditing).
- Double-clicking the resizer rail snaps between Default (200px) and Expanded (360px).
- Panel height is persisted in `localStorage` under `trading_drawer_height`.

---

## 6. Backend Protocol Extensions

### 6.1 Order Engine (`app/trading/order_engine.py`)

Add `add_balance` method:

```python
def add_balance(
    self,
    amount: float,
    user_id: str | None = None,
    is_demo: bool = False,
    note: str = "",
) -> AccountSummary:
    with self._lock:
        if amount <= 0:
            raise ValueError("Deposit amount must be positive")
        self.account.balance += amount
        self.account.update_totals()
        res = self.account

    if self.emit:
        self.emit("trading.account", self.get_account_summary())
    return res
```

### 6.2 Bridge Protocol (`app/bridge/commands.py`)

Add bridge slot:

```python
@Slot(str, result=str)
@Slot(float, result=str)
def addAccountBalance(self, payload: Any) -> str:
    def action():
        if self._services is None or not hasattr(self._services, "order_engine"):
            raise RuntimeError("order engine unavailable")
        amount = 1000.0
        user_id = None
        is_demo = False
        note = ""
        if isinstance(payload, (int, float)):
            amount = float(payload)
        elif isinstance(payload, str) and payload:
            parsed = json.loads(payload)
            if isinstance(parsed, dict):
                amount = float(parsed.get("amount", 1000.0))
                user_id = parsed.get("user_id")
                is_demo = bool(parsed.get("is_demo", False))
                note = parsed.get("note", "")
        summary = self._services.order_engine.add_balance(amount, user_id=user_id, is_demo=is_demo, note=note)
        return summary.to_dict()
    return self._envelope(action)
```

### 6.3 REST Cloud API (`app/api/server.py`)

Add endpoint:

```python
@app.post("/api/auth/add-balance")
async def auth_add_balance(request: Request):
    ctx = get_context()
    user = get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    body = await request.json()
    amount = float(body.get("amount", 1000.0))
    new_bal = ctx.auth_service.add_balance(user.id, amount)
    ctx.order_engine.add_balance(amount, user_id=user.id, is_demo=False)
    return {"ok": True, "data": {"balance": new_bal}}
```

---

## 7. Consequences and Trade-offs

### 7.1 Positive Consequences

- **Instant Usability:** Backtesting flow is uninterrupted; traders can reset blown balances in 2 clicks or add capital directly in the panel.
- **Visual Calm:** Eradicates the monolithic raw text pill, replacing it with elegant, styled metric capsules.
- **Enhanced Awareness:** Tab badges provide immediate ambient awareness of open exposure and pending orders.
- **Faster Execution:** Micro-action icon buttons and bulk "Close All" accelerate position management.
- **Ergonomic Flexibility:** Draggable resizer lets traders inspect lengthy trade journals comfortably without leaving the screen.

### 7.2 Negative Consequences & Mitigation

- **Added DOM & CSS Footprint:** Two new popovers and resizer handling code.
  - _Mitigation:_ Reuses universal popover engine (`popover-utils.ts`) with zero external libraries.
- **Accidental Balance Reset:** Risk of resetting an account by mistake.
  - _Mitigation:_ Popovers require explicit confirmation click (`[Reset Account]`), provide visual warning cues, and preserve trade history by default.

---

## 8. Verification & Testing Strategy

1. **Unit Tests (`tests/frontend/trading-drawer-simplified.test.ts`):**
   - Test tab switching and badge counter rendering when positions and orders change.
   - Test trigger and dismissal of `AddBalancePopover` and `ResetBalancePopover`.
   - Test drag-resizing and height persistence.
   - Test bulk action buttons (`Close All`, `Cancel All`).
2. **Regression Contract Tests:**
   - Run `tests/frontend/trading.test.ts` to guarantee `TradingDrawer` constructor and public API remain unbroken.
   - Run `tests/frontend/auth-e2e-verification.test.ts` to ensure demo session warning banner and journal auth prompts function identically.
3. **Python Bridge & API Tests (`tests/python/test_bridge_trading.py`):**
   - Verify `addAccountBalance` slot updates balance, equity, and emits `trading.account`.
   - Verify `resetAccount` respects `clear_journal` flag.
