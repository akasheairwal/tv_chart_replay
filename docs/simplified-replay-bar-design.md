# TradingView Simplified Replay Bar Specification & Ergonomic Design System

- **Author**: Antigravity Core Architecture Team
- **Date**: 2026-11-04
- **Status**: Approved Specification
- **Engine**: Trading Chart Replay Terminal (`tv_chart_replay`)
- **Companion ADR**: [ADR 0009: Simplified Replay Bar UI Architecture](file:///d:/code/tv_chart_replay/docs/adr/0009-simplified-replay-bar-ui-architecture.md)
- **Target Component**: `frontend/src/replay/replay-bar.ts` & `frontend/src/style.css`

---

## 1. Executive Summary & Design Rationale

In high-density financial charting terminals, visual calm and spatial economy are critical for trader focus. The replay toolbar provides essential temporal playback controls, but currently suffers from acute horizontal crowding, visual redundancy, and layout collisions when workspace sidebars (Watchlist and Trade Panel) are open.

This document establishes the comprehensive visual and interactive design system for the **Simplified Replay Bar**. By replacing text-heavy buttons with TradingView-standard media icons, substituting raw inline inputs with anchored popovers, and removing duplicated status indicators, the horizontal footprint is reduced from **~1,250px to ~460px** (a **63% reduction**) while significantly improving feature discoverability and tactile responsiveness.

---

## 2. Before vs. After Comparative Anatomy

### 2.1 Current Implementation (Overcrowded)

```
+-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| [⚡ Random] [⏮] [⏮ Step] [▶ Play] [Step ⏭] | [⏱ 1x ▾] [⚡ Mode: Real LTF ▾] [Fallback: Order Flow] | [2026-03-24T12:00] [⤴ Jump] | Bar 124 / 5000 (EURUSD · 1H) | [PLAYING] |
+-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
|<--------------- 320px ----------------->| |<----------------------- 260px ----------------------->| |<--------- 280px -------->| |<---------- 220px ---------->| |<- 70px ->|
 Total Bar Width: ~1,250px (Requires excessive screen width; breaks on laptops and multi-panel layouts)
```

#### Identified Defects:

1. **Redundant Text Labels:** Words like `"Step"`, `"Play"`, and `"Jump"` add cognitive noise without functional benefit.
2. **Sprawling Inline Datetime Input:** The native `<input type="datetime-local">` takes ~220px, renders with unstyled browser-native chrome, and disrupts the dark terminal aesthetic.
3. **Double Status Representation:** The play/pause button state and the separate `[PLAYING]` / `[PAUSED]` badge represent the exact same state twice.
4. **Duplicate Chart Context:** `(EURUSD · 1H)` is redundant with the permanent top header pill and chart watermark.
5. **Fragmented Mode Controls:** Formation mode requires an icon, a `<select>` dropdown, and a wide external badge (`[Fallback: Order Flow]`), consuming ~260px.

---

### 2.2 Proposed Simplified Design (Sleek & Modular)

```
+---------------------------------------------------------------------------------------------------------------------+
|                                              SIMPLIFIED REPLAY BAR                                                  |
|                                                                                                                     |
|  [⏮]  [⏪]  [ ▶ ]  [⏩]  [⚡]   │   [📅 Jump]   124 / 5,000   │   [⏱ 1x ▾]   [🟢 Real LTF ▾]                         |
|  (--- 1. Transport Group ---)   │   (--- 2. Timeline Group ---)  │   (--- 3. Engine Settings Group ---)                 |
+---------------------------------------------------------------------------------------------------------------------+
|<----------- 172px ----------->|     |<-------- 140px -------->|     |<----------- 150px ------------>|
 Total Bar Width: ~462px (Fits cleanly on any screen resolution down to 768px, with ample space for sidebars)
```

#### Key Improvements:

- **Zero Text Overhead on Transport:** Standardized 30x30px square buttons with crisp SVG media icons and rich keyboard-shortcut tooltips.
- **Progressive Disclosure:** Date Jump and Formation Mode configurations are accessible via anchored popovers.
- **Streamlined Progress Counter:** Clean, monospaced `124 / 5,000` counter.
- **Self-Indicating Status:** Play/pause button illuminates with active accent styling (`#2962ff`), deprecating the bulky `[PLAYING]` pill.

---

## 3. Horizontal Footprint Comparison Matrix

| Component Section     | Legacy Design Width      | Simplified Design Width | Space Saved     | Improvement                                   |
| :-------------------- | :----------------------- | :---------------------- | :-------------- | :-------------------------------------------- |
| **Transport Cluster** | ~320px                   | ~172px                  | **148px (46%)** | Icon-only buttons, unified 30px geometry      |
| **Date Jump Control** | ~280px (input + button)  | ~72px (`[📅 Jump]`)     | **208px (74%)** | Moved to anchored popover (`.tv-jump-popup`)  |
| **Counter & Status**  | ~290px (symbol + status) | ~68px (`124 / 5,000`)   | **222px (76%)** | Removed redundant pair/timeframe and badge    |
| **Formation Mode**    | ~260px (select + badge)  | ~78px (`[🟢 LTF ▾]`)    | **182px (70%)** | Consolidated into adaptive pill + popover     |
| **Speed Control**     | ~75px (`[⏱ 1x ▾]`)       | ~72px (`[⏱ 1x ▾]`)      | **3px (4%)**    | Maintained existing high-efficiency popover   |
| **Gaps & Dividers**   | ~25px                    | ~20px                   | **5px**         | Consistent 6px flex gaps with subtle dividers |
| **TOTAL BAR WIDTH**   | **~1,250px**             | **~462px**              | **788px (63%)** | **Fits all viewports without wrapping**       |

---

## 4. Component Deep Dive & Specifications

### 4.1 Cluster 1: Transport Controls (`.transport-group`)

```
   [⏮]       [⏪]       [ ▶ ]       [⏩]       [⚡]
  Reset    Step Back  Play/Pause  Step Fwd   Random
 (Home)      (←)       (Space)      (→)       (R)
```

1. **`resetBtn` (`[⏮]`):**
   - Icon: Standard media rewind/first-frame SVG.
   - Tooltip: `Reset to Start (Home)`.
   - Dimension: `30px × 30px`.
2. **`stepBackBtn` (`[⏪]`):**
   - Icon: Single left arrow / bar backward SVG.
   - Tooltip: `Step Backward (Left Arrow)`.
   - Action: Decrements replay by 1 bar; stops any active playback loop.
3. **`playBtn` (`[▶]` / `[⏸]`):**
   - Icon: Media Play (`▶`) or Media Pause (`⏸`).
   - Dimension: `32px × 32px` (prominent center anchor).
   - Styling:
     - **Paused/Idle:** Neutral background (`#1e222d`), subtle border (`#2a2e39`).
     - **Playing:** Blue accent background (`#2962ff`), white icon, subtle glowing ring (`box-shadow: 0 0 8px rgba(41, 98, 255, 0.4)`).
   - Tooltip: `Play / Pause (Space)`.
4. **`stepFwdBtn` (`[⏩]`):**
   - Icon: Single right arrow / bar forward SVG.
   - Tooltip: `Step Forward (Right Arrow)`.
   - Action: Steps 1 bar forward, invoking sub-tick micro-step if active.
5. **`randomBtn` (`[⚡]`):**
   - Icon: Lightning bolt SVG.
   - Styling: Accent warning border/glow on hover (Exness yellow `#ffb703`).
   - Tooltip: `Random Replay Start (R)`.

---

### 4.2 Cluster 2: Timeline & Navigation (`.timeline-group`)

```
  [ 📅 Jump ]      124 / 5,000
 (Jump Trigger)  (Bar Counter)
```

1. **`jumpTriggerBtn` (`[📅 Jump]`):**
   - Visual: Calendar icon + compact label "Jump".
   - Tooltip: `Jump to Date or Bar (J)`.
   - Behavior: Toggles the `.tv-jump-popup` directly above the trigger.
2. **`counterEl` (`124 / 5,000`):**
   - Font: `JetBrains Mono, monospace`, `11.5px`.
   - Color: `#787b86` (muted gray) with active bar `#d1d4dc` (bright white).
   - Format: `${currentIndex + 1} / ${totalCandles}`.
   - Tooltip: `Current Replay Bar: ${currentIndex + 1} of ${totalCandles} (${percentage}%)`.
3. **Optional Mini Scrubber Bar (Integrated beneath bar):**
   - A 2px high accent progress line at the bottom border of the replay bar, tracking `${(currentIndex / totalCandles) * 100}%`.

---

### 4.3 Cluster 3: Engine Settings (`.engine-group`)

```
  [ ⏱ 1x ▾ ]          [ 🟢 Real LTF ▾ ]
(Speed Popover)    (Formation Mode Popover)
```

1. **Speed Wrap (`[⏱ 1x ▾]`):**
   - Maintains the existing, validated `tv-speed-popup` interface.
   - Clicking opens the list of 11 presets (0.1x to 100x).
2. **Formation Mode Trigger (`[🟢 Real LTF ▾]`):**
   - Visual: Compact pill featuring:
     - Mode status indicator dot (3px radius).
     - Short mode title: `Real LTF`, `Tape Sim`, or `Instant`.
     - Dropdown chevron (`▾`).
   - Status Dot Colors:
     - 🟢 `#26a69a` (Teal): Real LTF ground-truth data active.
     - 🟠 `#ffa726` (Amber): Real LTF fallback to Order Flow tape simulation.
     - 🔵 `#2962ff` (Blue): Order Flow micro-tick tape simulation selected.
     - ⚪ `#787b86` (Gray): Instant mode (intra-bar bypass).
   - Tooltip: Reflects live status reason (e.g., `Real LTF: Replaying 60 1m bars`).
   - Behavior: Toggles `.tv-formation-popup`.

---

## 5. Popover Specifications

### 5.1 Date Jump Popover (`.tv-jump-popup`)

When the user clicks `[📅 Jump]` (or presses `J`), this popover renders anchored above the button:

```
+-------------------------------------------------------+
|  JUMP TO DATE / BAR                               [✕] |
+-------------------------------------------------------+
|  Quick Presets                                        |
|  [ Today ]   [ -1 Day ]   [ -1 Week ]   [ -1 Month ]  |
+-------------------------------------------------------+
|  Target Date & Time                                   |
|  [ 2026-03-24  14:30                          📅 ]    |
+-------------------------------------------------------+
|  [✁ Click Bar on Chart]             [ Cancel ] [ Jump ]|
+-------------------------------------------------------+
```

#### Features:

- **Quick Preset Buttons:** One-click shortcuts for high-frequency navigation intervals.
- **Form-Styled Input:** Clean dark-themed datetime picker styled with TradingView tokens.
- **Chart Interactive Jump (`✁ Click Bar on Chart`):** Activating this changes the chart cursor to a crosshair with a scissor icon, allowing the user to click any candle directly to jump replay there immediately.
- **Keyboard Handling:**
  - `Enter`: Confirms jump and closes popover.
  - `Escape`: Closes popover without jumping.

---

### 5.2 Formation Mode Popover (`.tv-formation-popup`)

When the user clicks `[🟢 Real LTF ▾]`, this popover renders anchored above the button:

```
+-------------------------------------------------------+
|  CANDLE FORMATION SIMULATION                      [✕] |
+-------------------------------------------------------+
|  (•) Real LTF (Multi-Timeframe)                       |
|      Replays authentic lower-timeframe historical      |
|      candles (e.g. 1m bars inside 1H candle).         |
|                                                       |
|      [Status: Active - 60 historical 1m bars loaded]  |
|                                                       |
|  ( ) Order Flow (Tape Simulation)                     |
|      4-phase institutional tape algorithm with dynamic|
|      Brownian micro-tick volume velocity.             |
|                                                       |
|  ( ) Instant (Maximum Speed)                          |
|      Bypasses intra-bar sub-ticks for instant candle   |
|      completion and rapid strategy scanning.          |
+-------------------------------------------------------+
```

#### Diagnostic Status Banner:

- If `Real LTF` is active, displays green status pill: `🟢 60 bars (1m)`.
- If fallback occurred (missing LTF data), displays amber explanation:
  `⚠️ Fallback: No 1m data downloaded for EURUSD. Using Order Flow simulation.`
  with a direct link/button: `[Download 1m Data]`.

---

### 5.3 Speed Selector Popover (`.tv-speed-popup`)

The speed popup is preserved from the current high-performance implementation:

- 11 speeds: `0.1x`, `0.25x`, `0.5x`, `1x`, `2x`, `3x`, `5x`, `10x`, `25x`, `50x`, `100x`.
- Monospaced speed value with bar-duration description (`1 bar / 10s`, `1 bar / 1s`, `10 bars / 1s`).
- Radio-style checkmark for active speed.

---

## 6. Popover Positioning and Clamping Logic

All popovers (`tv-speed-popup`, `tv-jump-popup`, `tv-formation-popup`) share a unified, boundary-aware positioning engine:

```typescript
function positionPopoverAbove(
  triggerEl: HTMLElement,
  popupEl: HTMLElement,
): void {
  const rect = triggerEl.getBoundingClientRect();
  const popupWidth = popupEl.offsetWidth || 220;
  const padding = 10;

  // 1. Position vertically above the replay bar
  const bottom = window.innerHeight - rect.top + 6;

  // 2. Center horizontally relative to trigger
  let left = rect.left + rect.width / 2 - popupWidth / 2;

  // 3. Viewport boundary clamping
  if (left < padding) {
    left = padding;
  } else if (left + popupWidth > window.innerWidth - padding) {
    left = Math.max(padding, window.innerWidth - padding - popupWidth);
  }

  popupEl.style.position = "fixed";
  popupEl.style.bottom = `${bottom}px`;
  popupEl.style.left = `${left}px`;
  popupEl.style.zIndex = "1000";
}
```

---

## 7. Responsive Breakpoint Rules

| Viewport Width      | Sidebar State      | Replay Bar Adaptations                                                                       |
| :------------------ | :----------------- | :------------------------------------------------------------------------------------------- |
| **> 1,200px**       | Any                | Full simplified layout (all icons + labels + counter visible).                               |
| **900px – 1,200px** | Both sidebars open | `Jump` label collapses to icon `[📅]`; mode label shortens to `LTF` / `Tape` / `Instant`.    |
| **600px – 900px**   | Tablet / Narrow    | Counter collapses to `124/5k`; mode shows status dot and icon only.                          |
| **< 600px**         | Mobile Viewport    | Timeline group hides counter, showing `[📅]` only; transport groups remain fully accessible. |

---

## 8. Visual Tokens & CSS Specifications

```css
/* Container */
.replay-bar.tv-replay-theme {
  height: 38px;
  background: #1e222d;
  border-top: 1px solid #2a2e39;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  gap: 8px;
  user-select: none;
  z-index: 30;
}

/* Button Base */
.replay-btn {
  width: 30px;
  height: 30px;
  background: #131722;
  border: 1px solid #2a2e39;
  border-radius: 6px;
  color: #d1d4dc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.12s cubic-bezier(0, 0, 0.2, 1);
  padding: 0;
}

.replay-btn:hover {
  background: #2a2e39;
  border-color: #363c4e;
  color: #ffffff;
}

/* Active Play State */
.replay-play-btn.playing {
  background: #2962ff;
  border-color: #2962ff;
  color: #ffffff;
  box-shadow: 0 0 8px rgba(41, 98, 255, 0.4);
}

/* Unified Mode Pill */
.replay-mode-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  background: #131722;
  border: 1px solid #2a2e39;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: #d1d4dc;
  cursor: pointer;
}

.replay-mode-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.replay-mode-dot.ltf-active {
  background: #26a69a;
}
.replay-mode-dot.ltf-fallback {
  background: #ffa726;
}
.replay-mode-dot.orderflow {
  background: #2962ff;
}
.replay-mode-dot.instant {
  background: #787b86;
}
```

---

## 9. Keyboard Navigation & Accessibility Matrix

| Key Combination     | Scope               | Action                                       |
| :------------------ | :------------------ | :------------------------------------------- |
| `Space`             | Global / Replay Bar | Toggle Play / Pause                          |
| `Left Arrow` (`←`)  | Replay Bar          | Step 1 Candle Backward                       |
| `Right Arrow` (`→`) | Replay Bar          | Step 1 Candle Forward                        |
| `Home`              | Replay Bar          | Reset Replay to Start Timestamp              |
| `R`                 | Replay Bar          | Random Replay Start Point                    |
| `J`                 | Global / Chart      | Open Jump to Date Popover                    |
| `<` / `>`           | Replay Bar          | Decrease / Increase Playback Speed           |
| `Escape`            | Active Popover      | Close open Speed, Jump, or Formation Popover |
| `Enter`             | Jump Popover        | Execute Jump to specified timestamp          |

---

## 10. Backward Compatibility & Test Guarantees

To ensure tests in `tests/frontend/` continue passing seamlessly:

1. **Retain Hidden Elements for Test Selectors:**
   - `<select class="replay-mode-select" style="display: none;">`: Continues to receive value changes when user picks a mode in `.tv-formation-popup`.
   - `<span class="replay-mode-status-badge" style="display: none;">`: Continues to update classes (`badge-ltf-active`, `badge-ltf-fallback`, etc.) and `textContent` as tested in `adr0002-brownian-simulation.test.ts`.
   - `<div class="replay-speed-wrap">` with `.replay-speed-label`, `.replay-speed-chevron`, `.replay-speed-select`: Fully preserved and operational as tested in `replay-speed-popup.test.ts`.

2. **Public Methods Contract:**
   - All public methods on `ReplayBar` (`update`, `toggleSpeedPopup`, `openSpeedPopup`, `closeSpeedPopup`, `selectSpeed`, `isSpeedPopupOpen`, `getSpeedDescription`, `destroy`) remain signature-compatible.

---

## 11. Implementation Plan (When Authorized to Code)

- **Phase 1: Popover Utility Abstraction**
  - Create reusable `positionPopover(anchor, popup)` helper for reliable positioning and viewport clamping.
- **Phase 2: Date Jump Popover Component**
  - Implement `.tv-jump-popup` with quick presets, datetime picker, and `Enter`/`Esc` key listeners.
- **Phase 3: Formation Mode Popover Component**
  - Unify `.replay-mode-wrap` into a clean trigger pill, build `.tv-formation-popup`, and wire synchronized test selectors.
- **Phase 4: CSS Refactoring & Icon Polish**
  - Update `frontend/src/style.css` with 38px bar height, 30px icon buttons, status indicator dots, and media queries.
- **Phase 5: Verification & Vitest Execution**
  - Run all Vitest suites to confirm zero regressions across `adr0002` and `replay-speed-popup` tests.
