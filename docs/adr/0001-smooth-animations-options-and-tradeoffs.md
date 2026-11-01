# ADR 0001: Smooth Animations, Options, and Tradeoffs

- **Status**: Implemented
- **Date**: 2026-11-01
- **Branch**: `animations-improvement`
- **Context**: Trading Chart Replay Terminal (`tv_chart_replay`)

---

## 1. Context and Problem Statement

In a real-time/replay financial terminal built with HTML5 Canvas (Lightweight Charts), TypeScript, and a Python desktop bridge (QWebChannel), achieving smooth 60fps / 120fps animations is critical for professional user experience.

Currently, several visual operations exhibit stutter, dropped frames ("jank"), or jarring transitions:

1. **UI Layout Resizing**: Opening/closing panels (watchlist, trading drawer, order panel) triggers CSS transitions on layout properties (`width`, `height`, `min-width`), while a `requestAnimationFrame` loop in `app.ts` (`animateChartResize`) repeatedly reads `clientWidth`/`clientHeight` (causing forced layout thrashing) and re-allocates/redraws the chart canvas on every single frame.
2. **Replay Candle Playback**: As the replay engine advances, candles appear instantaneously in discrete jumps, contrasting with the fluid formation seen in native TradingView live market feeds.
3. **Viewport Panning**: When candles reach the right edge of the chart, the horizontal timeline snaps abruptly.
4. **Drawing & Overlay Rendering**: Rapid mouse movements when sketching with pencil/brush tools can cause jagged lines or event queue backlog without pointer event coalescing.

We need an architectural blueprint detailing the options, technical tradeoffs, and implementation plan for smooth animations across all layers.

---

## 2. Decision Drivers

- **Frame Budget Adherence**: Deliver 60fps (16.6ms/frame) or 120fps (8.3ms/frame on high-refresh displays) without dropping frames.
- **Main Thread Preservation**: Ensure JS execution time remains low so indicator recalculations, bridge event dispatching, and order executions are never delayed.
- **Financial Precision**: Animations must never misrepresent price levels, order fills, or active SL/TP locations.
- **Maintainability & Simplicity**: Prefer native CSS/compositor and standard Web APIs over heavyweight external animation libraries.

---

## 3. Options and Tradeoffs by Domain

### Domain 1: UI & Layout Transitions (Watchlist, Drawer, Panels)

| Option                                                      | Description                                                                                                                          | Pros                                                                     | Cons                                                                                           | Verdict                                  |
| :---------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- | :--------------------------------------- |
| **1A: Continuous Canvas Resize Loop** _(Current)_           | Animate CSS `width`/`height` over 250ms; call `chart.resize()` every frame in rAF.                                                   | Chart is always exact pixel size.                                        | Severe layout thrashing; 15–30 canvas buffer re-allocations per toggle; dropped frames.        | **Deprecated**                           |
| **1B: GPU-Composited Transform Overlays**                   | Keep chart width fixed (100%); slide drawers and sidebars over chart using `transform: translate3d(...)` + `will-change: transform`. | 120fps guaranteed; 0 layout reflows; 0 canvas redraws; minimal CPU load. | Panels overlay part of chart margins while open instead of pushing content.                    | **Adopt for Overlays & Floating Panels** |
| **1C: CSS Scale + Single Canvas Commit at `transitionend`** | Animate layout with CSS; freeze canvas resize during motion; commit single `chart.resize()` once on `transitionend`.                 | Eliminates 95% of canvas context thrashing; smooth panel animation.      | Canvas content slightly stretches or scales during the 200–250ms motion before snapping sharp. | **Adopt for Docked Panels**              |
| **1D: Throttled ResizeObserver**                            | Let `ResizeObserver` handle sizing, but throttle canvas resizes to 30fps or trailing idle frame.                                     | Decoupled and automatic; handles window resizes cleanly.                 | Still triggers reflow if layout properties are transitioned in CSS.                            | **Adopt as Fallback for Window Resize**  |

---

### Domain 2: Replay Playback & Candle Forming

| Option                                              | Description                                                                                                                               | Pros                                                                         | Cons                                                                   | Verdict                                  |
| :-------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------- | :--------------------------------------------------------------------- | :--------------------------------------- |
| **2A: Discrete Bar Jumps (Instant)**                | When candle event arrives, immediately push bar via `series.update()` / `appendCandle()` with zero tweening.                               | Zero CPU overhead; simple; accurate timestamps; handles 20x+ speed easily.   | Visually rigid; lacks organic feel of a live market.                   | **Adopt as `Instant` Mode (Speeds > 2x / Max Performance)** |
| **2B: Continuous Micro-Tick Interpolation**         | Synthesize intra-bar ticks across 4 milestones ($P_0 \to P_1 \to P_2 \to P_3$) using rAF and cubic polynomial easing.                   | Silky TradingView live ticker feel; smooth candle body & wick expansion.     | Overly smooth / predictable; lacks authentic stochastic micro-pullbacks.| **Adopt as `Cinematic (Smooth)` Mode**   |
| **2C: Brownian Bridge with Pip Quantization**       | Quantize prices to instrument `minMove`; apply bounded zero-envelope stochastic Brownian noise & Poisson tick clustering ($20$–$90\text{ms}$). | Authentic market pulse & realistic micro-pullbacks; zero backend overhead.   | Synthetic intra-bar path rather than true exchange tick tape.          | **Adopt as `Brownian Bridge (Realistic)` Mode** |
| **2D: Markov Microstructure State Machine**         | 4-state order flow simulation (Accumulation ➔ Impulse Breakout ➔ Wick Exhaustion/Rejection ➔ Consolidation).                              | Institutional tape-reading feel; authentic momentum bursts and wick bounces. | Parameter tuning across asset classes.                                 | **Adopt as `Markov Microstructure` Mode** |
| **2E: User-Configurable Multi-Mode Performance Toggle** | Expose selectable modes in Replay Bar with persistence; auto-downgrade to Instant at speeds > 2x.                                         | Perfect user agency; caters to scalpers, macro analysts, and backtesters.    | Slight UI addition.                                                    | **Adopt as Core Replay Architecture**    |

---

### Domain 3: Viewport & Horizontal Camera Panning

| Option                                    | Description                                                                                                            | Pros                                                           | Cons                                                      | Verdict        |
| :---------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------- | :-------------------------------------------------------- | :------------- |
| **3A: Instant Edge Snap** _(Current)_     | Snap visible logical range once the newest bar exceeds the right margin.                                               | Simplest code; zero extra frames.                              | Visually jarring jump; disorients user focus.             | **Deprecated** |
| **3B: Eased Logical Range Interpolation** | Smoothly pan `chart.timeScale().setVisibleLogicalRange()` using ease-out cubic interpolation or spring physics in rAF. | Cinematic, comfortable camera tracking following price action. | Must cancel immediately upon user touch/drag interaction. | **Adopt**      |

---

### Domain 4: Freehand Drawing & Canvas Overlays

| Option                                         | Description                                                                                   | Pros                                                                     | Cons                                                               | Verdict                            |
| :--------------------------------------------- | :-------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- | :----------------------------------------------------------------- | :--------------------------------- |
| **4A: Unthrottled Pointer Events**             | Draw line segments directly on each `pointermove` event.                                      | Minimum code.                                                            | Floods event loop (120–240Hz); causes input lag on complex charts. | **Deprecated**                     |
| **4B: Coalesced Events + rAF Batching**        | Buffer points via `e.getCoalescedEvents()`; flush and redraw canvas once per animation frame. | Sub-pixel accuracy; low latency; strictly capped at screen refresh rate. | Requires point queue management in drawing engine.                 | **Adopt**                          |
| **4C: Curve Smoothing (Catmull-Rom / Bézier)** | Calculate Bézier control points between mid-points of incoming stroke coordinates.            | Smooth, organic hand-drawn lines without polygonal jaggedness.           | 1-point latency delay before segment commits.                      | **Adopt for Pencil / Brush Tools** |

---

### Domain 5: Numerical Data & PnL Displays

| Option                                   | Description                                                                                                            | Pros                                                              | Cons                                                                       | Verdict        |
| :--------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------- | :------------------------------------------------------------------------- | :------------- |
| **5A: Raw String Updates**               | Directly overwrite DOM element `textContent` on each tick.                                                             | Exact values at all times.                                        | Visual jitter and horizontal layout shifting when character widths change. | **Deprecated** |
| **5B: Monospace Numerics + Lerp Tweens** | Apply `font-variant-numeric: tabular-nums` in CSS; interpolate display values over 80–120ms with linear interpolation. | Rock-solid numeric alignment; pleasant rolling-counter aesthetic. | Must ensure settled value matches exact trading engine state.              | **Adopt**      |

---

## 4. Overall Decision and Architectural Strategy

We will implement a **3-phase optimization strategy**:

### Phase 1: High-Impact UI & Layout Quick Wins (Target: Zero Layout Jank)

1. **Eliminate per-frame canvas resize**: Remove the `requestAnimationFrame` loop in `app.ts` (`animateChartResize`).
2. **Commit resize on `transitionend`**: Let CSS handle panel opening/closing, and dispatch a single `chart.resize()` when the transition finishes.
3. **GPU Layer Promotion**: Add `transform: translateZ(0)` / `will-change: transform` to drawer headers, panels, and modals in `style.css`.
4. **Use Tabular Numbers**: Add `font-variant-numeric: tabular-nums` to `.ticker-price`, `.position-pnl`, and order inputs to eliminate layout shifting during updates.

### Phase 2: Adaptive Replay Interpolation & Smooth Panning

1. **Multi-Mode Sub-Tick Formation Engine in `ReplayController`**:
   - For playback speeds $\le 2\text{x}$, provide a selectable Candle Formation / Performance mode:
     - **Instant / Off**: Zero animation, immediate bar commits (optimal for high-speed scanning and low battery usage).
     - **Cinematic (Smooth)**: 4-milestone cubic polynomial curve ($P_0 \to P_1 \to P_2 \to P_3$) with smooth rAF tweening.
     - **Brownian Bridge (Realistic)**: Discrete pip quantization to instrument `minMove`, bounded stochastic Brownian noise with zero-boundary sine envelope, and Poisson tick arrival pacing ($20\text{ms}$–$90\text{ms}$).
     - **Markov Microstructure**: Institutional order-flow state transitions (Accumulation $\to$ Impulse Breakout $\to$ Wick Exhaustion / Liquidity Absorption $\to$ Micro-Consolidation).
   - Expose a compact mode selector dropdown in `ReplayBar` persisted in `localStorage`.
   - Auto-downgrade to Instant mode at playback speeds $> 2\text{x}$ to prevent main-thread event starvation.
2. **Camera Follow Lerp**:
   - When the replay index reaches the right visible boundary, animate the time scale logical range smoothly towards the new index over 150ms.

### Phase 3: Drawing Engine Pipeline

1. **Batch Canvas Redraws**: Refactor `DrawingEngine` pointer handlers to collect points via `getCoalescedEvents()` and trigger redraws only on `requestAnimationFrame`.
2. **Spline Interpolation**: Implement mid-point quadratic Bézier curve interpolation for pencil/brush strokes.

---

## 5. Consequences

### Positive

- **Rock-solid 60/120fps UI**: Eliminates noticeable stutter when opening/closing sidebars, watchlist, and order forms.
- **Premium User Experience**: Matches the visual fidelity of modern trading platforms (TradingView, Exness).
- **Reduced Battery & CPU Consumption**: Eliminating forced synchronous reflow loops lowers idle and replay CPU usage.
- **Trader Versatility & Agency**: Accommodates tape readers/scalpers needing authentic market jitter alongside macro analysts preferring smooth visual playback and backtesters requiring instant zero-overhead execution.

### Negative & Mitigations

- _Mitigation for panel resize delay_: During panel transitions (200ms), canvas is scaled slightly; immediate snap to crisp vector rendering occurs on `transitionend`.
- _Mitigation for replay tick synthesis_: At high replay speeds (> 2x), interpolation is automatically bypassed to prevent main thread event starvation.
