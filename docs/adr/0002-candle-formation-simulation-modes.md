# ADR 0002: Replay Candle Formation Strategy — Real LTF, Order Flow, and Instant Modes

- **Status**: Accepted
- **Date**: 2026-11-01
- **Branch**: `animations-improvement`
- **Context**: Trading Chart Replay Terminal (`tv_chart_replay`)

---

## 1. Executive Summary & Reason for Update

In earlier iterations ([ADR 0001](file:///d:/code/tv_chart_replay/docs/adr/0001-smooth-animations-options-and-tradeoffs.md) and initial drafts of ADR 0002), four modes were explored to animate intra-bar candle formation:
1. *Instant*: Instantaneous commits.
2. *Cinematic*: 4-milestone cubic polynomial easing ($P_0 \to P_1 \to P_2 \to P_3$).
3. *Brownian Bridge*: Stochastic Gaussian noise with sinusoidal envelope modulation.
4. *Markov Microstructure / Order Flow*: Probabilistic state machine modeling institutional tape dynamics.

### Deprecation & Removal of Brownian and Cinematic Modes

Hands-on testing and feedback highlighted critical flaws in purely synthetic curves:
1. **Unverifiable "Fabricated Path"**: Both Cinematic and Brownian modes invent fictional intra-bar price trajectories. In path-dependent trading strategies (ICT, SMC, Fair Value Gaps, trailing stop executions), guessing whether the High or Low occurred first causes phantom stop-outs or fake profit targets that never occurred in exchange history.
2. **Pacing & Freeze Artifacts**: Synthetic curves rely on heuristic duration caps. At slow playback speeds ($0.25\text{x}$ or $0.5\text{x}$), synthetic animations completed early and sat frozen for seconds, degrading user immersion.
3. **Mathematical Redundancy**: Having two separate synthetic noise/easing modes created unnecessary maintenance overhead without providing real trading value.

### The Refined 3-Mode Strategy

We are **pruning Brownian and Cinematic modes entirely** and establishing three purpose-built modes:

```mermaid
flowchart TD
    A["Incoming Replay Step"] --> B{"Replay Speed <= 2x?"}
    B -->|No (> 2x)| C["1. Instant Mode (Max Performance / Backtesting)"]
    B -->|Yes (<= 2x)| D{"User Selected Mode"}
    D --> E["1. Instant Mode"]
    D --> F["2. Order Flow Mode (Microstructure Tape Simulation)"]
    D --> G["3. Real LTF Mode (Ground Truth Exchange Data)"]
```

1. **`ltf` (Real LTF Ground Truth) [Default / Recommended]**:
   Drives intra-bar formation using actual lower-timeframe historical candles (e.g., $1\text{m}$ bars expanding a $1\text{H}$ candle). $100\%$ authentic exchange sequence, real wick timings, and true order execution validity.
2. **`orderflow` (Order Flow & Tape Dynamics)**:
   Algorithmic institutional tape dynamics (Accumulation $\to$ Momentum Breakout $\to$ Wick Exhaustion $\to$ Micro-Consolidation) with non-linear volume acceleration and pip quantization. Operates entirely client-side without requiring LTF datasets to be downloaded.
3. **`instant` (Max Performance / Backtest)**:
   Zero animation overhead, direct bar-by-bar commits. Enforced at speeds $>2\text{x}$ or selectable for high-throughput automated backtesting.

---

## 2. Decision Drivers

- **Ground Truth Integrity**: Discretionary traders and backtesters need absolute historical fidelity for order fills, wicks, and structural market shifts.
- **Client Autonomy & Offline Fallback**: If a trader has not downloaded $1\text{m}$ historical datasets for an asset, `orderflow` mode provides an immediate, realistic client-side simulation without failing or requiring gigabytes of network downloads.
- **Backtesting Throughput**: High-speed backtesting ($>2\text{x}$ to $100\text{x}$) requires instantaneous bar commits with zero tweening CPU cycles.
- **Clean Architecture**: Consolidates the replay engine into three clearly differentiated modes: **Real Data**, **Algorithmic Simulation**, and **Instant Performance**.

---

## 3. Detailed Specifications of the Three Modes

### Mode 1: Real LTF Ground Truth (`ltf`) [Default]

- **Mechanism**:
  When replaying an active Higher Timeframe (HTF) chart (e.g. $1\text{H}$), the engine queries the local database for the highest-resolution Lower Timeframe (LTF) available (e.g. $1\text{m}$ or $5\text{m}$).
  The HTF candle's Open, High, Low, Close, and Volume are progressively expanded in real time as each genuine historical LTF bar is processed:
  $$O_{\text{HTF}} = O_{\text{LTF}, 0}$$
  $$H_{\text{HTF}}(t) = \max\left(H_{\text{HTF}}(t-1), H_{\text{LTF}}(t)\right)$$
  $$L_{\text{HTF}}(t) = \min\left(L_{\text{HTF}}(t-1), L_{\text{LTF}}(t)\right)$$
  $$C_{\text{HTF}}(t) = C_{\text{LTF}}(t)$$
  $$V_{\text{HTF}}(t) = \sum_{k=0}^{t} V_{\text{LTF}, k}$$

- **Timeframe Resolution Hierarchy**:
  - $1\text{D}$ chart $\leftarrow$ driven by $1\text{H}$ ($24$ steps) or $15\text{m}$ ($96$ steps).
  - $4\text{H}$ chart $\leftarrow$ driven by $15\text{m}$ ($16$ steps) or $5\text{m}$ ($48$ steps).
  - $1\text{H}$ chart $\leftarrow$ driven by $5\text{m}$ ($12$ steps) or $1\text{m}$ ($60$ steps).
  - $15\text{m}$ chart $\leftarrow$ driven by $1\text{m}$ ($15$ steps).
  - $5\text{m}$ chart $\leftarrow$ driven by $1\text{m}$ ($5$ steps).
  - $1\text{m}$ (Base) chart $\leftarrow$ Instant commit (or tick-level data if available).

- **Cadence & Pacing**:
  For an HTF candle containing $N$ historical LTF bars over nominal interval $T_{\text{nominal}} = 1000\text{ms} / \text{speed}$:
  $$\Delta t_{\text{LTF}} = \frac{T_{\text{nominal}} \times 0.95}{N}$$
  - *Example at 1.0x*: $1\text{H}$ bar driven by 60 $1\text{m}$ bars updates every $\approx 15.8\text{ms}$ ($60\text{fps}$ real progression).
  - *Example at 0.25x*: Updates every $\approx 63.3\text{ms}$, smoothly pacing throughout the full $4.0\text{s}$ duration with zero freezing.

- **Pros**: $100\%$ historical truth; zero fabricated paths; perfect multi-chart synchronization; accurate stop/limit order triggers.
- **Cons**: Requires LTF historical data present in the database.

---

### Mode 2: Order Flow & Tape Dynamics (`orderflow`)

- **Mechanism**:
  Decomposes candle formation into four probabilistic state phases based on institutional auction theory:
  1. **`ACCUMULATION`** ($0 \le t < 15\%$): Tight bid-ask bouncing around $P_0$ (Open) within $\pm 1 \sim 2$ pips with low volume velocity ($0\% \to 10\%$).
  2. **`MOMENTUM_BREAKOUT`** ($15\% \le t < 35\%$): Directional multi-pip thrust sweeping limit order depth towards Extrema 1 with rapid Poisson bursts ($10\text{ms} \sim 20\text{ms}$).
  3. **`WICK_EXHAUSTION`** ($35\% \le t < 75\%$): Iceberg absorption dwell at the extreme followed by an aggressive rejection snap back into the bar body, surging towards Extrema 2 with volume climax ($35\% \to 80\%$).
  4. **`MICRO_CONSOLIDATION`** ($75\% \le t \le 100\%$): Dampening settling fluctuations into historical Close ($P_3$) with volume completing to $100\%$.

- **Conservation & Precision**:
  - Emits prices quantized to the instrument's exact `minMove`.
  - Strictly clamped within $[Low, High]$.
  - Zero-drift guarantee: terminates and commits the exact historical candle.

- **Pros**: Realistic market microstructure, micro-pullbacks, and dynamic volume velocity without needing multi-megabyte LTF databases downloaded; ideal offline fallback.
- **Cons**: Intra-bar sequence is algorithmically synthesized rather than exchange-recorded.

---

### Mode 3: Instant / Off (`instant`)

- **Mechanism**:
  Completely bypasses intra-bar simulation. Directly commits the completed historical candle `onCommit(candle)` to the series.
- **Default Trigger**: Automatically enforced when playback speed $> 2.0\text{x}$.
- **Pros**: $0\%$ CPU overhead; zero latency; maximum throughput for backtesting hundreds of bars per second.
- **Cons**: Lacks intra-bar visual continuity.

---

## 4. Architectural Design & Strategy Pattern

### Strategy Interface in `sub-tick-generator.ts`

```typescript
export type FormationMode =
  | 'ltf'
  | 'orderflow'
  | 'instant';

export interface IntraBarState {
  candle: CompactCandleRow;
  speed: number;
  minMove: number;
  durationMs: number;
  startTime: number;
}
```

The `SubTickGenerator` exposes interchangeable routines:
- `stepLTF(state, ltfIndex, ltfSlice): CompactCandleRow`
- `stepOrderFlow(state, elapsed, markovContext, now): number`
- `feed(candle, speed, manualStep, minMove, ltfSlice?): void`

### User Interface in `ReplayBar`

The toolbar dropdown reflects the three focused options:

```
[ Speed: 1x ▼ ] [ Mode: Real LTF ▼ ]
```

Dropdown items:
1. `Real LTF` (`ltf`) — Default
2. `Order Flow` (`orderflow`)
3. `Instant` (`instant`)

Stored in `localStorage.getItem('tv_replay_formation_mode')` defaulting to `'ltf'`.

---

## 5. Summary of Removed Modes

| Deprecated Mode | Former ID | Reason for Removal | Replacement |
|---|---|---|---|
| **Cinematic** | `cinematic` | Deterministic cubic polynomial curve is artificial, monotonic, and lacks market microstructure. | Replaced by `ltf` for real market flow or `instant` for speed. |
| **Brownian Bridge** | `brownian` | Stochastic Gaussian jitter produces synthetic price paths that invalidate strategy backtests and stop-loss logic. | Replaced by `orderflow` (structured tape dynamics) and `ltf` (real data). |

---

## 6. Implementation Plan & Next Steps

When approved to begin coding:
1. **Frontend (`sub-tick-generator.ts`)**:
   - Update `FormationMode` type to `'ltf' | 'orderflow' | 'instant'`.
   - Remove `stepCinematic` and `stepBrownian`.
   - Standardize `stepMicrostructure` as `stepOrderFlow`.
   - Add `stepLTF` handler accepting real historical LTF candle slices.
2. **Replay Controller & UI (`replay-controller.ts`, `replay-bar.ts`)**:
   - Update dropdown options to `[ Real LTF, Order Flow, Instant ]`.
   - Update `localStorage` persistence.
3. **Data Pipeline**:
   - Wire backend/frontend LTF slice delivery when `mode === 'ltf'`.
4. **Test Suite**:
   - Update unit tests to validate the 3 active modes.
