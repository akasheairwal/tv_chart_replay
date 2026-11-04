# Trading Terminal Simplified Bottom Panel Specification & Ergonomic Design System

- **Author**: Antigravity Core Architecture Team
- **Date**: 2026-11-04
- **Status**: Approved Specification
- **Engine**: Trading Chart Replay Terminal (`tv_chart_replay`)
- **Companion ADR**: [ADR 0010: Simplified Bottom Trading Panel UI Architecture and Capital Management System](file:///d:/code/tv_chart_replay/docs/adr/0010-simplified-bottom-trading-panel-ui-and-balance-management.md)
- **Target Components**: 
  - `frontend/src/ui/trading-drawer.ts`
  - `frontend/src/ui/capital-popovers.ts`
  - `frontend/src/style.css`
  - `app/trading/order_engine.py`

---

## 1. Executive Summary & Design Rationale

In high-density financial charting and market simulation environments, the bottom panel functions as the trader's command dock — tracking exposure, order states, historical journaling, and portfolio solvency.

While the existing implementation provides basic tabular visibility, it suffers from three primary UX bottlenecks:
1. **Capital Inflexibility:** Backtesting strategies require frequent balance adjustments (re-baselining after drawdowns, testing high-leverage prop firm sizing, or depositing incremental simulation capital). The bottom drawer currently provides **no deposit or balance addition capability**, and balance reset is buried in the top header user menu behind jarring browser alerts.
2. **Horizontal Crowding & Monolithic String Status:** Financial metrics are grouped into a single, unformatted text string (`Balance: $10,000.00 | Equity: $10,000.00 | PnL: +$0.00 | Active: ...`). When sidebars (Watchlist and Trade Panel) are open, this string collides with tabs, wraps awkwardly, or causes horizontal overflow.
3. **Low Ambient Awareness:** Tabs lack live counter badges, forcing users to click between tabs simply to check if they have resting orders or open trades. Table action buttons are text-heavy, and the panel has a rigid fixed height that makes multi-trade journal analysis frustrating.

This document defines the comprehensive visual and interactive design system for the **Simplified Bottom Trading Panel**. It delivers a clean, three-zone header, live counter badges, unified financial telemetry capsules, first-class anchored **Add Balance** and **Reset Balance** popovers, streamlined micro-action tables, and fluid drag-resizability.

---

## 2. Before vs. After Comparative Anatomy

### 2.1 Current Implementation (Cluttered & Inflexible)

```
+------------------------------------------------------------------------------------------------------------------------------------+
| [Open Positions]  [Pending Orders]  [Trade Journal]  [Account Summary]  │ Balance: $10,000.00 | Equity: $10,000.00 │ [ ▾ ]         |
+------------------------------------------------------------------------------------------------------------------------------------+
|                                                                                                                                    |
|  Symbol   Side   Volume   Entry     Current   SL     TP     Unrealized PnL   Action                                                  |
|  EURUSD   LONG   1.00     1.0850    1.0875    1.0800 1.0920 +$250.00 (+25p)  [🎯 SL/TP]  [✂️ Partial]  [✕ Close]                    |
|                                                                                                                                    |
+------------------------------------------------------------------------------------------------------------------------------------+
  - Monolithic, unformatted account text string without color differentiation.
  - Zero balance management controls in panel.
  - No item counters on tabs.
  - Action buttons take up ~230px per table row with bulky text and mixed emojis.
  - Fixed 190px height with no resizability.
```

### 2.2 Proposed Simplified Implementation (Clean, High-Density, Modular)

```
+====================================================================================================================================+
| [--- 4px Draggable Top Resizer Handle ---]                                                                    (.drawer-resizer)   |
+------------------------------------------------------------------------------------------------------------------------------------+
|  ZONE 1: SEGMENTED TABS              ZONE 2: FINANCIAL METRIC CAPSULES              ZONE 3: CAPITAL & MACRO ACTIONS                |
|  [📈 Positions (1)] [⏳ Orders (0)]  │  BAL $10,000.00   EQ $10,250.00           │  [+ Add]  [↺ Reset]  [✕ Close All]   [⛶]  [▾]    |
|  [📜 Journal (18)]  [💳 Summary]    │  PNL +$250.00 (+2.50%)   FREE $9,800       │                                                 |
+------------------------------------------------------------------------------------------------------------------------------------+
|                                                                                                                                    |
|  SYMBOL     SIDE    VOLUME    ENTRY      CURRENT     SL       TP       UNREALIZED P&L        QUICK ACTIONS                         |
|  EURUSD     BUY     1.00 Lot  1.08500    1.08750     1.08000  1.09200  +$250.00 (+25.0 pips) [🎯]  [✂️]  [✕]                        |
|                                                                                                                                    |
+====================================================================================================================================+
  - Segmented tab bar with live numerical badges and category icons.
  - Modular financial metric capsules with high-contrast color formatting.
  - Dedicated [+ Add] and [↺ Reset] capital management buttons with anchored popovers.
  - Contextual bulk actions ([Close All] / [Cancel All]).
  - Micro-action icon buttons with rich tooltips, reducing action column width from 230px to 95px.
  - Drag-resizer handle with double-click snap points (Collapsed: 38px, Default: 200px, Expanded: 380px, Maximized: 80vh).
```

---

## 3. Horizontal Footprint & Responsive Layout Breakdown

To ensure perfect rendering across all resolutions and panel configurations, the header employs a fluid three-zone architecture:

| Breakpoint / Context | Available Width | Zone 1 (Tabs) | Zone 2 (Metrics) | Zone 3 (Capital & Actions) | UX Adaptation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Ultra-Wide / Clean** (No sidebars) | `> 1600px` | Full labels + icons + badges | All 4 metrics visible (Bal, Eq, PnL, Free Margin) | `[+ Add Balance]`, `[↺ Reset]`, `[Close All]`, Window toggles | Maximum data visibility |
| **Standard Desktop** (1 sidebar open) | `1100px - 1599px` | Full labels + icons + badges | 3 core metrics (Bal, Eq, PnL) | `[+ Add]`, `[↺ Reset]`, `[Close All]`, Window toggles | Free margin collapsed into tooltip |
| **High Density** (Both sidebars open) | `850px - 1099px` | Compact labels + badges | 2 metrics (Eq, PnL) | Compact `[+]`, `[↺]`, `[Close]`, Window toggles | Secondary metrics visible in Summary tab |
| **Compact / Laptop** (`< 850px`) | `< 850px` | Icons only + badges | 1 metric (Floating P&L pill) | Icon-only `[+]`, `[↺]`, `[▾]` | Preserves full usability with zero element wrapping |

---

## 4. Component Deep Dive & Specifications

### 4.1 Zone 1: Segmented Navigation Bar with Live Counter Badges

The tab bar (`.trading-drawer-tabs`) is modernized into a segmented container with pill-shaped tabs:

```
  +---------------------------------------------------------------------------------+
  | [📈 Positions  1 ]  [⏳ Orders  0 ]  [📜 Journal  18 ]  [💳 Summary ]            |
  +---------------------------------------------------------------------------------+
```

#### Specifications:
1. **Tab Structure:**
   - Container: Flexbox row with `gap: 4px`, padding `3px 4px`, background `var(--tv-bg-darker, #131722)`.
   - Each tab (`.trading-tab`):
     - Height: `28px`, border-radius `5px`, padding `0 10px`.
     - Active state: Background `var(--tv-panel-subtle, #2a2e39)`, text `var(--tv-fg-bright, #d1d4dc)`.
     - Inactive hover: Text `var(--tv-fg-bright, #d1d4dc)`.
2. **Dynamic Badges (`.tab-badge`):**
   - Pill geometry: Height `16px`, min-width `18px`, border-radius `9px`, font-size `10px`, font-weight `700`.
   - **Positions Badge:**
     - `0`: Dimmed neutral (`#434651`).
     - `> 0`: Active blue accent (`#2962ff`) or bullish green (`#089981`) with white text.
   - **Orders Badge:**
     - `0`: Dimmed neutral (`#434651`).
     - `> 0`: Amber accent (`#f59e0b`) with dark text.
   - **Journal Badge:** Monospace neutral count of total completed trades.

---

### 4.2 Zone 2: Financial Telemetry Capsules

Replaces the unstyled pipe-separated text pill with modular metric capsules:

```
  +------------------------------------------------------------------------------------+
  |  [ BAL  $10,000.00 ]   [ EQ  $10,250.00 ]   [ P&L  +$250.00 (+2.50%) ]   [ FREE  $9,800 ] |
  +------------------------------------------------------------------------------------+
```

#### Specifications:
1. **Capsule Anatomy (`.metric-capsule`):**
   - Geometry: Height `26px`, border-radius `5px`, padding `0 8px`, border `1px solid var(--tv-border-subtle, #2a2e39)`.
   - Typography: JetBrains Mono, `11.5px`.
   - Label: `font-size: 10px`, `color: var(--tv-fg-muted, #787b86)`, `font-weight: 700`, uppercase prefix.
   - Value: `font-weight: 600`, `color: var(--tv-fg-bright, #d1d4dc)`.
2. **P&L Visual Cue:**
   - Positive P&L: Text `#089981` (TradingView green), subtle green tint background (`rgba(8, 153, 129, 0.08)`).
   - Negative P&L: Text `#f23645` (TradingView red), subtle red tint background (`rgba(242, 54, 69, 0.08)`).
   - Flat/Zero: Text `var(--tv-fg-muted)`.

---

### 4.3 Zone 3: Capital Management & Macro Action Cluster

Positioned at the right side of the drawer header:

```
  +-------------------------------------------------------------------------------------+
  |  [+ Add Balance]   [↺ Reset Balance]   │   [✕ Close All (1)]   │   [ ⛶ ]   [ ▾ ]     |
  +-------------------------------------------------------------------------------------+
```

#### 4.3.1 "+ Add Balance" Popover Specification

Clicking `[+ Add Balance]` (`#drawer-add-balance-btn`) opens the anchored popover `.tv-capital-popover.add-balance-popup` directly above the button using `popover-utils.ts`:

```
+--------------------------------------------------------------+
| 💰 Add Paper Balance (Deposit Simulation)                 ✕ |
+--------------------------------------------------------------+
| Current Balance: $10,000.00        New Total: $15,000.00     |
|                                                              |
| Quick Deposit Amounts:                                       |
| [ +$500 ]  [ +$1,000 ]  [ +$5,000* ]  [ +$10,000 ]  [ +$50k ]|
|                                                              |
| Custom Amount:                                               |
| [ $ | 5000.00                                            ]   |
|                                                              |
| Deposit Note (Optional):                                     |
| [ e.g. Strategy re-load, Phase 2 evaluation              ]   |
+--------------------------------------------------------------+
| [ Cancel ]                            [ Confirm Deposit (+$5k) ]
+--------------------------------------------------------------+
```

##### Interactive Behaviors:
- **Instant Chip Selection:** Clicking any quick deposit chip immediately updates the custom amount input and live `New Total` preview.
- **Validation:** Ensures amount is positive and numeric. Disables confirm button if invalid.
- **Keyboard Shortcuts:** `Enter` confirms deposit; `Escape` closes popover without applying changes.
- **Optimistic Telemetry:** Updates `balance`, `equity`, and `free_margin` immediately, notifies backend via bridge or REST API, and displays a confirmation toast.

---

#### 4.3.2 "↺ Reset Balance" Popover Specification

Clicking `[↺ Reset Balance]` (`#drawer-reset-balance-btn`) opens the anchored popover `.tv-capital-popover.reset-balance-popup` directly above the button:

```
+--------------------------------------------------------------+
| 🔄 Reset Paper Account Balance                            ✕ |
+--------------------------------------------------------------+
| Target Starting Capital:                                     |
| [ $1,000 ]  [ $5,000 ]  [ $10,000* ]  [ $25k ]  [ $50k ] [ $100k ]
|                                                              |
| Custom Capital Base:                                         |
| [ $ | 10000.00                                           ]   |
|                                                              |
| Trade History & Journal:                                     |
| [ ] Clear closed trade history & reset win rate stats        |
|     (Leave unchecked to keep past journal records intact)    |
|                                                              |
| ⚠️ Warning: All open positions will be closed at market.     |
+--------------------------------------------------------------+
| [ Cancel ]                                [ Reset Account ]  |
+--------------------------------------------------------------+
```

##### Interactive Behaviors:
- **Preset Starting Bases:** Provides standard trading account baselines (\$1k, \$5k, \$10k, \$25k, \$50k, \$100k).
- **History Preservation Choice:**
  - *Default (Unchecked):* Balance is reset to target capital; historical closed trades, win rate statistics, and session logs are safely preserved.
  - *Checked:* Complete portfolio purge — wipes trade journal, resets statistics to 0, and restores virgin account state.
- **Confirmation Safeguard:** Clear warning banner preventing accidental re-baselining during active evaluations.
- **Event Emission:** Signals bridge `resetAccount` or `authResetAccount`, emitting `trading.account` and `trading.positions`.

---

#### 4.3.3 Contextual Macro Actions

- **`[✕ Close All]` Button:**
  - Context: Visible when `Positions` tab is active.
  - State: Disabled when open positions = 0; enabled with count badge `[✕ Close All (2)]` when open positions ≥ 1.
  - Action: Closes all active positions at current replay market prices in a single batch call.
- **`[✕ Cancel All]` Button:**
  - Context: Visible when `Orders` tab is active.
  - State: Disabled when pending orders = 0; enabled with count badge `[✕ Cancel All (3)]` when pending orders ≥ 1.
  - Action: Cancels all resting pending orders simultaneously.

---

#### 4.3.4 Window Management Controls

- **Maximize / Restore Toggle (`[⛶]` / `#drawer-maximize-btn`):**
  - Expands the panel to `calc(100vh - 120px)`, giving the trader a full-screen trading desk view to analyze journal logs and account metrics.
  - Clicking again restores the previous height.
- **Collapse / Expand Toggle (`[▾]` / `#drawer-toggle-btn`):**
  - Collapses drawer to `38px` header height, maximizing candlestick canvas viewing area.
  - Chevron flips vertically; triggers chart resize event.

---

### 4.4 Draggable Split-Pane Resizer Rail

A 4px interactive boundary rail (`.trading-drawer-resizer`) is positioned along the top edge of the drawer:

```
  +==================================================================================+
  |                   · · · · · · · · · · · · · · · · · · · · · ·                    |
  +==================================================================================+
```

#### Specifications:
- **CSS:** `height: 4px`, `cursor: row-resize`, `background: transparent`, `transition: background 0.2s`.
- **Hover State:** Glows with subtle accent line `background: var(--tv-accent, #2962ff)`.
- **Drag Behavior:** Tracks mouse pointer Y position relative to viewport bottom. Constrains height between `38px` (min) and `calc(100vh - 100px)` (max).
- **Double-Click Snap:**
  - If `< 150px` -> snaps to Default (`200px`).
  - If `200px` -> snaps to Tall (`380px`).
  - If `> 350px` -> snaps to Default (`200px`).
- **Persistence:** Saved in `localStorage.setItem('trading_drawer_height', height)`.

---

### 4.5 Tab Content Redesigns

#### 4.5.1 Open Positions Tab (`#tab-positions-content`)

```
+------------------------------------------------------------------------------------------------------------------------------+
| SYMBOL     SIDE    LOTS     ENTRY      CURRENT    SL          TP          UNREALIZED P&L        PIPS       ACTIONS           |
| EURUSD     BUY     1.00     1.08500    1.08750    1.08000 ✎   1.09200 ✎   +$250.00 (+2.50%)     +25.0p     [🎯]  [✂️]  [✕]    |
| BTCUSD     SELL    0.50     64,200.0   63,850.0   64,800  ✎   63,000  ✎   +$175.00 (+1.75%)     +35.0p     [🎯]  [✂️]  [✕]    |
+------------------------------------------------------------------------------------------------------------------------------+
```

##### Refinements:
1. **Micro-Action Icon Buttons:** Replaces wide text buttons with square `26x26px` action buttons:
   - `[🎯]` **Modify SL/TP:** Opens `SlTpConfirmDialog`.
   - `[✂️]` **Partial Close:** Opens `PartialCloseDialog`.
   - `[✕]` **Close Market:** One-click close at current replay price.
2. **Inline Editable Affordance:** SL and TP cells display a subtle pencil icon (`✎`) on hover to clarify that double-clicking edits the target directly.
3. **Pips Column:** Dedicated column for pip displacement, decoupling currency PnL from distance.

---

#### 4.5.2 Pending Orders Tab (`#tab-orders-content`)

```
+------------------------------------------------------------------------------------------------------------------------------+
| ORDER ID   SYMBOL     SIDE    TYPE      LOTS     TRIGGER PRICE   CURRENT PRICE   SL         TP         PLACED AT   ACTION    |
| ord_8a2f   GBPUSD     BUY     LIMIT     0.50     1.26500         1.26820         1.26100    1.27500    14:32:05    [✕ Cancel]|
+------------------------------------------------------------------------------------------------------------------------------+
```

##### Refinements:
- Distinct badges for `LIMIT` (cyan), `STOP` (purple), `MARKET` (blue).
- Distance to trigger metric (`1.26500 (-32 pips)`).
- Clean `[✕ Cancel]` button.

---

#### 4.5.3 Trade Journal Tab (`#tab-journal-content`)

```
+------------------------------------------------------------------------------------------------------------------------------+
| PERFORMANCE STRIP:                                                                                                           |
| [ Trades: 24 ]  [ Win Rate: 62.5% ]  [ Net PnL: +$1,420.50 ]  [ Profit Factor: 2.15 ]  [ Best: +$540 ] │ [🔍 Filter] [📥 CSV]|
+------------------------------------------------------------------------------------------------------------------------------+
| TIME       SYMBOL   SIDE    VOLUME   ENTRY      EXIT       PNL ($)        PNL (%)     EXIT REASON     HOLD DURATION             |
| 14:15:20   EURUSD   BUY     1.00     1.08200    1.08550    +$350.00       +3.23%      TAKE_PROFIT     1h 45m                    |
| 11:02:10   XAUUSD   SELL    0.50     2345.50    2348.00    -$125.00       -1.07%      STOP_LOSS       22m                       |
+------------------------------------------------------------------------------------------------------------------------------+
```

##### Refinements:
1. **Mini Performance Summary Bar:** Instant KPIs directly above the journal table without switching tabs.
2. **Filter & Export Controls:** Quick filter pills (`All`, `Wins`, `Losses`) and `[📥 Export CSV]` button.
3. **Compact Demo Session Warning:** Streamlined, modern banner alert with subtle border and clear login trigger.

---

#### 4.5.4 Account Summary Tab (`#tab-account-content`)

```
+------------------------------------------------------------------------------------------------------------------------------+
| [ Balance: $10,000.00 ]   [ Equity: $10,450.00 ]   [ Free Margin: $9,800.00 ]   [ Margin Level: 1,607.7% ]                   |
| [ Margin Used: $650.00 ]  [ Realized: +$1,250.00 ] [ Unrealized: +$450.00 ]     [ Max Drawdown: 4.2% ]                       |
+------------------------------------------------------------------------------------------------------------------------------+
| CAPITAL MANAGEMENT DOCK:                                                                                                     |
| Quick Top-Up:  [ +$1,000 ]  [ +$5,000 ]  [ +$10,000 ]  [ Custom Deposit... ]                                                 |
| Reset Account: [ Reset to $10,000 ]  [ Reset to $50,000 ]  [ Custom Baseline... ]                                            |
+------------------------------------------------------------------------------------------------------------------------------+
```

##### Refinements:
- Dedicated **Capital Management Dock** embedded right inside the Account Summary tab, offering one-click presets without even opening popovers.
- Progress bar visualizations for **Margin Utilization** and **Win/Loss Ratio**.

---

## 5. Backend Contract & Protocol Extensions

### 5.1 Order Engine (`app/trading/order_engine.py`)

Add deposit/add balance method with concurrency locking and event emission:

```python
def add_balance(
    self,
    amount: float,
    user_id: str | None = None,
    is_demo: bool = False,
    note: str = "",
) -> AccountSummary:
    """Add funds to the paper trading account balance (deposit simulation)."""
    with self._lock:
        if amount <= 0:
            raise ValueError("Deposit amount must be positive")
        self.account.balance = round(self.account.balance + amount, 2)
        self.account.update_totals()
        res = self.account

    if self.emit:
        self.emit("trading.account", self.get_account_summary())
    return res
```

### 5.2 Python Bridge Command (`app/bridge/commands.py`)

Expose `addAccountBalance` slot to PySide6 Qt WebChannel:

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
        summary = self._services.order_engine.add_balance(
            amount, user_id=user_id, is_demo=is_demo, note=note
        )
        return summary.to_dict()
    return self._envelope(action)
```

### 5.3 FastAPI Cloud Endpoint (`app/api/server.py`)

Expose cloud HTTP endpoint for REST authentication parity:

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

## 6. CSS Design Tokens & Styling Architecture

```css
/* Bottom Trading Drawer — Ergonomic Design Tokens */
:root {
  --drawer-header-h: 38px;
  --drawer-tab-bg: #131722;
  --drawer-tab-active-bg: #2a2e39;
  --drawer-pill-bg: #1e222d;
  --drawer-pill-border: #2a2e39;
  --drawer-resizer-h: 4px;
}

/* Draggable Split-Pane Resizer Rail */
.trading-drawer-resizer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--drawer-resizer-h);
  cursor: row-resize;
  background: transparent;
  z-index: 40;
  transition: background 0.15s ease;
}

.trading-drawer-resizer:hover,
.trading-drawer-resizer.dragging {
  background: var(--tv-accent, #2962ff);
  box-shadow: 0 0 8px rgba(41, 98, 255, 0.4);
}

/* Header Three-Zone Grid */
.trading-drawer-header {
  height: var(--drawer-header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  background: var(--tv-panel-subtle, #1e222d);
  border-bottom: 1px solid var(--tv-border-subtle, #2a2e39);
  gap: 12px;
}

/* Segmented Tabs */
.trading-drawer-tabs {
  display: flex;
  align-items: center;
  background: var(--drawer-tab-bg);
  padding: 3px;
  border-radius: 6px;
  gap: 2px;
}

.trading-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--tv-fg-muted, #787b86);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.trading-tab.active {
  background: var(--drawer-tab-active-bg);
  color: var(--tv-fg-bright, #d1d4dc);
}

.tab-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--tv-fg-muted);
}

.tab-badge.active-pos {
  background: rgba(8, 153, 129, 0.18);
  color: #089981;
}

.tab-badge.active-ord {
  background: rgba(245, 158, 11, 0.18);
  color: #f59e0b;
}

/* Capital Popovers */
.tv-capital-popover {
  width: 320px;
  background: #1e222d;
  border: 1px solid var(--tv-border, #2a2e39);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: popoverFadeIn 0.15s cubic-bezier(0, 0, 0.2, 1);
}

.capital-chip-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.capital-chip-btn {
  background: #131722;
  border: 1px solid #2a2e39;
  color: #d1d4dc;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 6px 0;
  border-radius: 4px;
  cursor: pointer;
  text-align: center;
}

.capital-chip-btn:hover,
.capital-chip-btn.active {
  border-color: #2962ff;
  color: #2962ff;
  background: rgba(41, 98, 255, 0.08);
}
```

---

## 7. Accessibility, Keyboard Shortcuts & Micro-Interactions

| Key Binding / Gesture | Context | Action |
| :--- | :--- | :--- |
| `D` (or `Alt+D`) | Global Chart | Toggle bottom drawer collapse/expand |
| `Escape` | Inside Capital Popover | Closes popover and returns focus to trigger button |
| `Enter` | Inside Custom Capital Input | Submits deposit / reset immediately |
| `Double Click` | SL or TP Table Cell | Opens SL/TP modification dialog for selected position |
| `Double Click` | Draggable Top Resizer | Snaps panel height between Default (200px) and Tall (380px) |

---

## 8. Implementation Plan & Phasing

- [x] **Phase 1: Backend Protocol Updates**
  - Implement `OrderEngine.add_balance` in `app/trading/order_engine.py`.
  - Add `addAccountBalance` slot to `app/bridge/commands.py`.
  - Add `/api/auth/add-balance` endpoint to `app/api/server.py`.
  - Add backend unit test coverage in `tests/python/test_order_engine.py` and `test_bridge_trading.py`.

- [x] **Phase 2: Capital Popover Component (`frontend/src/ui/capital-popover.ts`)**
  - Construct reusable `CapitalPopoverManager` for `AddBalancePopover` and `ResetBalancePopover`.
  - Wire quick preset chips, custom amount inputs, validation, and confirmation hooks.
  - Utilize `positionPopoverAbove` and `attachPopoverDismissal` from `popover-utils.ts`.

- [x] **Phase 3: Trading Drawer Header & Resizer Redesign (`frontend/src/ui/trading-drawer.ts`)**
  - Rebuild `buildDrawer()` template into 3-zone structure with draggable resizer rail.
  - Implement dynamic tab badges (`#badge-positions`, `#badge-orders`, `#badge-journal`).
  - Implement financial metric capsules.
  - Connect `[+ Add]` and `[↺ Reset]` popovers.
  - Connect bulk actions `[Close All]` and `[Cancel All]`.

- [x] **Phase 4: Table & Tab Content Modernization**
  - Refine Open Positions table with micro-action buttons (`🎯`, `✂️`, `✕`).
  - Add mini performance KPI bar to Trade Journal.
  - Integrate interactive capital top-up presets into Account Summary card view.

- [x] **Phase 5: Verification & Vitest Regression Suite**
  - Add `tests/frontend/trading-drawer-simplified.test.ts`.
  - Verify zero regressions against `tests/frontend/trading.test.ts` and `auth-e2e-verification.test.ts`.

