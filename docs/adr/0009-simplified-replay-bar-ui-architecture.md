# ADR 0009: Simplified Replay Bar UI Architecture and Ergonomic Popover System

- **Status**: Proposed
- **Date**: 2026-11-04
- **Context**: Trading Chart Replay Terminal (`tv_chart_replay`)
- **Engine**: Frontend TypeScript Replay Engine (`frontend/src/replay/replay-bar.ts`)
- **Companion Specification**: [Simplified Replay Bar Design Specification](file:///d:/code/tv_chart_replay/docs/simplified-replay-bar-design.md)
- **Related ADRs**:
  - [ADR 0001: Smooth Animations, Options, and Tradeoffs](file:///d:/code/tv_chart_replay/docs/adr/0001-smooth-animations-options-and-tradeoffs.md)
  - [ADR 0002: Candle Formation Simulation Modes](file:///d:/code/tv_chart_replay/docs/adr/0002-candle-formation-simulation-modes.md)
  - [ADR 0006: Unified Drawing Tool Settings Dialog Architecture](file:///d:/code/tv_chart_replay/docs/adr/0006-unified-drawing-tool-settings-dialog-architecture.md)
  - [ADR 0007: Chart Context Menu and Floating Settings Popup](file:///d:/code/tv_chart_replay/docs/adr/0007-chart-context-menu-and-floating-settings-popup.md)

---

## 1. Context and Problem Statement

The Trading Chart Replayer features a bottom dock replay bar (`.replay-bar.tv-replay-theme`) providing playback transport, speed adjustment, candle formation simulation modes (ADR 0002), and temporal date jumping.

As additional features were integrated (real LTF multi-timeframe candle streaming, brownian order flow simulation, fallbacks, and date-time jumping), all controls were placed directly side-by-side into a single 42px horizontal flex row.

### Key Pain Points of the Current Implementation:

1. **Severe Horizontal Overcrowding (> 1,250px Minimum Width):**
   - The current bar houses 11 distinct interactive widgets:
     - Left Transport: `[⚡ Random]`, `[⏮ Reset]`, `[⏮ Step]`, `[▶ Play]`, `[Step ⏭]` (all featuring text labels).
     - Right Controls: Speed dropdown (`[⏱ 1x ▾]`), Mode dropdown (`[⚡ Mode ▾]`), Mode diagnostic badge (`[Fallback: Order Flow]`), native datetime input (`<input type="datetime-local">`), Jump button (`[⤴ Jump]`), Bar counter (`Bar 124 / 5000 (EURUSD · 1H)`), and Status badge (`[PLAYING]`).
   - The native `datetime-local` input alone consumes ~220px of horizontal space.
   - When users open both the Watchlist sidebar (280px) and the Trade panel (320px) on standard 1080p displays (or 1366x768 / 1440x900 laptops), the available chart width drops below 1,300px, resulting in element wrapping, horizontal clipping, or truncated text labels.

2. **Visual & Cognitive Clutter:**
   - Redundant textual labels: buttons say "Step", "Play", "Jump", and "Random", whereas standard trading software (TradingView, MT5) uses intuitive media icons.
   - Redundant state indicators: having an explicit `[PLAYING]` / `[PAUSED]` text badge duplicates the state visually conveyed by the play/pause button itself.
   - Redundant context: displaying `(EURUSD · 1H)` in the bottom bar repeats information already displayed in the top navigation symbol pill (`#header-sym-pill`) and chart watermark.

3. **Inconsistent Interaction Models:**
   - Speed selection uses a TradingView-style popover menu, whereas simulation mode uses a raw browser HTML `<select>` plus an external badge, and jumping uses a raw HTML5 `<input type="datetime-local">`.

---

## 2. Decision Drivers

- **Ergonomic TradingView Alignment:** Clean, icon-first, 1:1 TradingView aesthetic with high signal-to-noise ratio.
- **Compact Horizontal Footprint:** Total idle width must fit under **500px** (a >60% reduction), operating smoothly without collision across all resolutions (down to 768px wide) even when both sidebars are expanded.
- **Progressive Disclosure:** Move detailed, secondary interactions (Date Jump configuration and Formation Mode diagnostics) into lightweight, keyboard-accessible popovers anchored to clean trigger buttons.
- **Zero Breakage of Testing Contracts:** Preserve DOM and programmatic interfaces expected by existing Vitest test suites (`adr0002-brownian-simulation.test.ts` and `replay-speed-popup.test.ts`).
- **Accessible Keyboard Control:** Support key bindings (`Space` to toggle, `Left/Right` arrow keys to step, `Home` to reset, `R` for random, `J` for jump).

---

## 3. Evaluated Architectural Alternatives

### Alternative A: Modular Compact Dock with Anchored Popovers (Selected)
- **Concept:** Keep the bar docked at the bottom of the chart canvas, but restructure it into three focused groups:
  1. **Transport Cluster:** Compact icon-only buttons (`Reset`, `Step Back`, `Play/Pause`, `Step Fwd`, `Random`).
  2. **Timeline Cluster:** Compact `[📅 Jump]` trigger button + monospaced `124 / 5,000` counter.
  3. **Engine Cluster:** `[1x ▾]` speed popover trigger + `[⚡ Mode ▾]` unified formation mode popover trigger.
- Clicking `[📅 Jump]` opens `.tv-jump-popup` with quick date presets and date-time input.
- Clicking `[⚡ Mode ▾]` opens `.tv-formation-popup` with radio options and live LTF/fallback diagnostics.
- *Pros:* Drastically reduces footprint from 1,250px to ~460px; retains standard bottom-dock ergonomics; eliminates UI jitter; clean progressive disclosure.
- *Cons:* Requires popover positioning and boundary clamping logic for the two new popovers (reusing existing speed popup patterns).

---

### Alternative B: Draggable Floating Replay HUD (TradingView Exact Clone)
- **Concept:** Detach the replay bar from the DOM layout flow and place it into a floating, draggable HUD positioned above the bottom chart margin with `backdrop-filter: blur(8px)`.
- *Pros:* Matches TradingView's floating bar behavior 1:1; allows moving the bar anywhere on the canvas.
- *Cons:* Adds drag-and-drop state persistence, potential occlusion of candle bars or bottom volume oscillators, and added complexity for responsive mobile/tablet layouts.
- *Recommendation:* Keep docked layout as default (Alternative A), with modular CSS architecture that enables floating HUD mode as an optional user toggle in a future milestone.

---

### Alternative C: Multi-Row Stacked Drawer (Rejected)
- **Concept:** Split the replay bar into two rows: top row for transport and speed, bottom row for jump input and mode status.
- *Why Rejected:* Consumes 70-80px of vertical chart height, reducing the chart canvas display area for candlesticks and indicators.

---

### Alternative D: Modal Dialogs for Jump and Mode Settings (Rejected)
- **Concept:** Opening jump or mode displays a centered modal backdrop dialog over the chart.
- *Why Rejected:* Obstructs the trader's chart view, breaks rapid workflow, and feels heavy compared to lightweight anchored popovers.

---

## 4. Architectural Decision

We adopt **Alternative A: Modular Compact Dock with Anchored Popovers**.

### 4.1 Component Decomposition

```
+---------------------------------------------------------------------------------------------------+
|                                      REPLAY BAR (.replay-bar)                                     |
|                                                                                                   |
|  [⏮] [⏪] [ ▶ ] [⏩] [⚡]  |   [📅 Jump] 124 / 5,000   |   [⏱ 1x ▾]   [⚡ Real LTF ▾]            |
|  (--- Transport Group ---)     (--- Timeline Group ---)     (--- Engine Config Group ---)          |
+---------------------------------------------------------------------------------------------------+
                                       |                                   |
                                       v                                   v
                             +-------------------+               +-------------------+
                             |   tv-jump-popup   |               | tv-formation-popup|
                             | Quick Presets     |               | (•) Real LTF      |
                             | Target Timestamp  |               | ( ) Order Flow    |
                             | [ Jump to Date ]  |               | ( ) Instant       |
                             +-------------------+               | Diagnostics Badge |
                                                                 +-------------------+
```

### 4.2 Group Specifications

1. **Transport Group (`.replay-group.transport-group`):**
   - Universal media icon buttons without bulky text labels.
   - Consistent square geometry: 30x30px, 6px border-radius.
   - Primary `Play/Pause` button features accented contrast (`#2962ff` background when playing) with clear keyboard shortcut tooltips (`Space`, `←`, `→`, `Home`, `R`).

2. **Timeline Group (`.replay-group.timeline-group`):**
   - Replaces the inline `<input type="datetime-local">` and jump button with a single compact `[📅 Jump]` trigger.
   - Counter simplified from `Bar 124 / 5000 (EURUSD · 1H)` to `124 / 5,000` (or `Bar 124 / 5,000`), removing redundant pair/timeframe duplication.
   - Status badge (`[PLAYING]`) is deprecated in favor of play button icon/state illumination.

3. **Engine Configuration Group (`.replay-group.engine-group`):**
   - **Speed Selector (`.replay-speed-wrap`):** Preserves the existing `tv-speed-popup` widget and tests.
   - **Formation Mode Selector (`.replay-mode-wrap`):** Unified into a single trigger button with status dot:
     - Shows current mode name (e.g., `Real LTF`, `Tape Sim`, `Instant`).
     - Colored dot conveys status:
       - 🟢 Green: Real LTF active (`badge-ltf-active`)
       - 🟠 Orange: Real LTF fallback (`badge-ltf-fallback`)
       - 🔵 Blue: Order flow simulation (`badge-orderflow`)
       - ⚪ Gray: Instant mode (`badge-instant`)
     - Clicking opens `.tv-formation-popup` containing mode selection radio buttons, lower timeframe info, and fallback reason diagnostics.

---

## 5. Backward Compatibility and Testing Contracts

To ensure existing Vitest tests (`tests/frontend/replay-speed-popup.test.ts` and `tests/frontend/adr0002-brownian-simulation.test.ts`) continue to pass without regression:

1. **DOM Selectors Preservation:**
   - `.replay-speed-wrap`, `.replay-speed-label`, `.replay-speed-chevron`, `.replay-speed-select`, `.tv-speed-popup`, `.tv-speed-item` will remain fully functional and in their expected hierarchy.
   - `.replay-mode-select` will remain present in the DOM (hidden from layout via CSS `display: none` or embedded within `.replay-mode-wrap`) and kept synchronized with the active mode.
   - `.replay-mode-status-badge` will remain present in the DOM (mirrored inside the mode wrapper / popover) and updated with appropriate classes (`badge-ltf-active`, `badge-ltf-fallback`, `badge-orderflow`, `badge-instant`) and `title` tooltips.
2. **Public API Contract:**
   - `ReplayBar.update(state: ReplayState): void`
   - `ReplayBar.selectSpeed(speed: number): void`
   - `ReplayBar.toggleSpeedPopup(): void`
   - `ReplayBar.openSpeedPopup(): void`
   - `ReplayBar.closeSpeedPopup(): void`
   - `ReplayBar.destroy(): void`

---

## 6. Consequences & Metrics

### Positive Consequences:
- **Footprint Reduction:** Replay bar horizontal width drops from **~1,250px** to **~460px** (a **63% reduction**), eliminating layout breakage on all tested screens.
- **Visual Harmony:** Iconographic buttons align with TradingView Supercharts standard.
- **Zero Chart Canvas Pollution:** Removing the huge native datetime picker eliminates browser-inconsistent controls and unstyled OS elements.
- **Enhanced Diagnostics:** Formation mode popover provides traders with transparent LTF bar count and fallback diagnostics without cluttering the main bar.

### Negative Consequences / Mitigations:
- *Additional popover state management:* Requires event listeners for outside click and `Escape` key handling.
  - *Mitigation:* Abstract a reusable `PopoverManager` pattern shared across Speed, Jump, and Formation popovers.
- *Two-click date jump vs. single click:* Users must click `Jump`, then select date.
  - *Mitigation:* Add instant keyboard shortcut (`J`), default focus to the date field, and support `Enter` to jump immediately.

