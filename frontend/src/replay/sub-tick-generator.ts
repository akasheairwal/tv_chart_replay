import type { CompactCandleRow } from '../chart/candle-series';
import { detectPricePrecision } from '../chart/chart-manager';

export type FormationMode =
  | 'ltf'
  | 'orderflow'
  | 'instant';

export type MicrostructurePhase =
  | 'ACCUMULATION'
  | 'MOMENTUM_BREAKOUT'
  | 'WICK_EXHAUSTION'
  | 'MICRO_CONSOLIDATION';

export interface IntraBarState {
  candle: CompactCandleRow;
  speed: number;
  minMove: number;
  durationMs: number;
  startTime: number;
}

export interface LTFContext {
  slice: CompactCandleRow[];
  totalSteps: number;
  lastStepIndex: number;
}

export interface MarkovContext {
  phase: MicrostructurePhase;
  walk: number;
  sigma: number;
  nextTickTime: number;
  p0: number; // Open
  p1: number; // Extrema 1
  p2: number; // Extrema 2
  p3: number; // Close
  lastEmittedPrice: number;
  burstRemaining: number;
  volumeProgress: number;
}

export interface FormationStatus {
  mode: FormationMode;
  effectiveMode: FormationMode;
  isFallback: boolean;
  ltfBarsCount: number;
}

export interface SubTickConfig {
  onMicroTick: (candle: CompactCandleRow, price: number) => void;
  onCommit: (candle: CompactCandleRow) => void;
  mode?: FormationMode;
  minMove?: number;
}

/**
 * Standard normal random variable via Box-Muller transform N(0, 1).
 */
export function standardNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Determines exact decimal places from an instrument minMove step.
 * e.g. 0.00001 -> 5, 0.001 -> 3, 0.25 -> 2, 1.0 -> 0.
 */
export function getStepDecimals(step: number): number {
  if (!step || step >= 1) return 0;
  const str = step.toString();
  if (str.includes('e-')) {
    const parts = str.split('e-');
    return parseInt(parts[1], 10);
  }
  const decimalPart = str.split('.')[1];
  return decimalPart ? decimalPart.length : 0;
}

/**
 * Quantizes a price to the nearest instrument tick (minMove) with exact decimal precision.
 *
 * P_quantized = round(P / minMove) * minMove
 */
export function quantizePrice(price: number, minMove: number): number {
  if (!minMove || minMove <= 0) return price;
  const decimals = getStepDecimals(minMove);
  const steps = Math.round(price / minMove);
  return Number((steps * minMove).toFixed(decimals));
}

/**
 * Smooth cubic ease-in-out polynomial curve.
 */
export function cubicEaseInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * SubTickGenerator (ADR 0002)
 *
 * Implements 3 High-Fidelity Candle Formation Modes:
 * - Mode 1: Real LTF (`ltf`) [Default] - Expands HTF candle using actual historical lower-timeframe bars.
 * - Mode 2: Order Flow (`orderflow`) - Algorithmic institutional tape dynamics & dynamic volume velocity.
 * - Mode 3: Instant (`instant`) - Bypasses simulation for max performance / backtesting.
 */
export class SubTickGenerator {
  private activeRafId: number | null = null;
  private currentTarget: CompactCandleRow | null = null;
  private mode: FormationMode;
  private defaultMinMove: number;
  private lastStatus: FormationStatus;

  constructor(private readonly config: SubTickConfig) {
    this.mode = config.mode ?? 'ltf';
    this.defaultMinMove = config.minMove ?? 0.00001;
    this.lastStatus = {
      mode: this.mode,
      effectiveMode: this.mode,
      isFallback: false,
      ltfBarsCount: 0,
    };
  }

  get isRunning(): boolean {
    return this.activeRafId !== null;
  }

  getFormationMode(): FormationMode {
    return this.mode;
  }

  getFormationStatus(): FormationStatus {
    return { ...this.lastStatus, mode: this.mode };
  }

  setFormationMode(mode: FormationMode): void {
    this.mode = mode;
    this.lastStatus.mode = mode;
    if (mode === 'instant') {
      this.lastStatus.effectiveMode = 'instant';
      this.lastStatus.isFallback = false;
    } else if (mode === 'orderflow') {
      this.lastStatus.effectiveMode = 'orderflow';
      this.lastStatus.isFallback = false;
    }
  }

  setMinMove(minMove: number): void {
    if (minMove > 0) {
      this.defaultMinMove = minMove;
    }
  }

  getMinMove(): number {
    return this.defaultMinMove;
  }

  /**
   * Mode 1: Real LTF Ground Truth Replay.
   *
   * Progressively updates the HTF candle's Open, High, Low, Close, and Volume
   * using the actual historical lower-timeframe (LTF) bars recorded from the exchange.
   */
  stepLTF(
    state: IntraBarState,
    elapsed: number,
    ctx: LTFContext,
  ): { candle: CompactCandleRow; price: number } {
    const progress = Math.min(1, elapsed / state.durationMs);
    const N = ctx.totalSteps;

    if (progress >= 1 || N <= 1) {
      return {
        candle: state.candle,
        price: state.candle[4],
      };
    }

    const stepIndex = Math.min(N - 1, Math.floor(progress * N));
    ctx.lastStepIndex = stepIndex;

    const [htfTime] = state.candle;
    const initialBar = ctx.slice[0];
    const currentBar = ctx.slice[stepIndex];

    const open = initialBar[1];
    let high = initialBar[2];
    let low = initialBar[3];
    let volumeAcc = 0;

    for (let i = 0; i <= stepIndex; i++) {
      const b = ctx.slice[i];
      if (b[2] > high) high = b[2];
      if (b[3] < low) low = b[3];
      volumeAcc += b[5] || 0;
    }

    const currentPrice = currentBar[4];
    const partialCandle: CompactCandleRow = [
      htfTime,
      open,
      high,
      low,
      currentPrice,
      volumeAcc,
    ];

    return {
      candle: partialCandle,
      price: currentPrice,
    };
  }

  /**
   * Mode 2: Order Flow & Tape Dynamics.
   *
   * Decomposes intra-bar formation into 4 order flow state phases:
   * 1. ACCUMULATION: Tight bid-ask bouncing around Open with low volume velocity
   * 2. MOMENTUM_BREAKOUT: Rapid, directional multi-pip jumps sweeping order depth
   * 3. WICK_EXHAUSTION: Deceleration / absorption at extremes with sharp rejection snap-back
   * 4. MICRO_CONSOLIDATION: Dampening settling fluctuations into final Close
   */
  stepOrderFlow(
    state: IntraBarState,
    elapsed: number,
    ctx: MarkovContext,
    now: number,
  ): number {
    const [, open, high, low, close] = state.candle;
    const progress = Math.min(1, elapsed / state.durationMs);

    if (progress >= 1) {
      ctx.volumeProgress = 1;
      return close;
    }

    let rawPrice: number;
    let nextDelayMs: number;

    // Phase 1: ACCUMULATION / GRIND (0 <= progress < 0.15)
    if (progress < 0.15) {
      ctx.phase = 'ACCUMULATION';
      const u = progress / 0.15;
      ctx.volumeProgress = 0.10 * u;

      // Mean-reverting random walk around Open (tight bid-ask bounce)
      const innovation = standardNormal();
      ctx.walk = 0.40 * ctx.walk + 0.60 * innovation;
      const noise = ctx.walk * (state.minMove * 1.5);
      // Soft directional lean towards Extrema 1 as breakout approaches
      const drift = (ctx.p1 - open) * 0.12 * (u * u);
      rawPrice = open + drift + noise;

      // Quiet order book cadence
      nextDelayMs = 35 + Math.random() * 40;
    }
    // Phase 2: MOMENTUM BREAKOUT & WICK EXHAUSTION (Extrema 1: 0.15 <= progress < 0.35)
    else if (progress < 0.35) {
      const u = (progress - 0.15) / 0.20;
      ctx.volumeProgress = 0.10 + 0.25 * u;

      if (u < 0.75) {
        ctx.phase = 'MOMENTUM_BREAKOUT';
        // Directional thrust from Open to Extrema 1
        const t = u / 0.75;
        const ease = t * t;
        const baseline = open + (ctx.p1 - open) * ease;
        const envelope = Math.sin(Math.PI * t);
        const innovation = standardNormal();
        ctx.walk = 0.70 * ctx.walk + 0.30 * innovation;
        rawPrice = baseline + envelope * ctx.walk * (ctx.sigma * 0.5);

        // Fast breakout pacing with bursts
        if (ctx.burstRemaining > 0) {
          ctx.burstRemaining--;
          nextDelayMs = 10 + Math.random() * 10;
        } else if (Math.random() < 0.35) {
          ctx.burstRemaining = Math.floor(Math.random() * 3) + 1;
          nextDelayMs = 10 + Math.random() * 12;
        } else {
          nextDelayMs = 18 + Math.random() * 25;
        }
      } else {
        ctx.phase = 'WICK_EXHAUSTION';
        // Wick turn: reaches P1 then sharply snaps back into body
        const t = (u - 0.75) / 0.25;
        const rejectionTarget = ctx.p1 + (open - ctx.p1) * 0.35;
        rawPrice = ctx.p1 + (rejectionTarget - ctx.p1) * cubicEaseInOut(t);

        // Absorption dwell pause near extreme, then swift snap
        nextDelayMs = t < 0.3 ? 60 + Math.random() * 35 : 15 + Math.random() * 15;
      }
    }
    // Phase 3: MAIN EXPANSION & WICK EXHAUSTION (Extrema 2: 0.35 <= progress < 0.75)
    else if (progress < 0.75) {
      const u = (progress - 0.35) / 0.40;
      ctx.volumeProgress = 0.35 + 0.45 * u;

      if (u < 0.80) {
        ctx.phase = 'MOMENTUM_BREAKOUT';
        // Major directional expansion from Extrema 1 to Extrema 2
        const t = u / 0.80;
        const ease = cubicEaseInOut(t);
        const baseline = ctx.p1 + (ctx.p2 - ctx.p1) * ease;
        const envelope = Math.sin(Math.PI * t);
        const innovation = standardNormal();
        ctx.walk = 0.65 * ctx.walk + 0.35 * innovation;
        rawPrice = baseline + envelope * ctx.walk * ctx.sigma;

        if (ctx.burstRemaining > 0) {
          ctx.burstRemaining--;
          nextDelayMs = 12 + Math.random() * 12;
        } else if (Math.random() < 0.30) {
          ctx.burstRemaining = Math.floor(Math.random() * 3) + 1;
          nextDelayMs = 12 + Math.random() * 12;
        } else {
          nextDelayMs = 20 + Math.random() * 30;
        }
      } else {
        ctx.phase = 'WICK_EXHAUSTION';
        // Rejection at Extrema 2 snap-back towards Close
        const t = (u - 0.80) / 0.20;
        const snapTarget = ctx.p2 + (close - ctx.p2) * 0.40;
        rawPrice = ctx.p2 + (snapTarget - ctx.p2) * cubicEaseInOut(t);

        nextDelayMs = t < 0.3 ? 55 + Math.random() * 35 : 18 + Math.random() * 18;
      }
    }
    // Phase 4: MICRO-CONSOLIDATION (0.75 <= progress <= 1.0)
    else {
      ctx.phase = 'MICRO_CONSOLIDATION';
      const u = (progress - 0.75) / 0.25;
      ctx.volumeProgress = 0.80 + 0.20 * u;

      // Settling trajectory towards historical Close (P3)
      const currentAnchor = ctx.p2 + (close - ctx.p2) * 0.40;
      const baseline = currentAnchor + (close - currentAnchor) * cubicEaseInOut(u);

      // Dampening fluctuations: noise strictly vanishes as u -> 1
      const dampening = Math.sin(Math.PI * u) * (1 - u);
      const innovation = standardNormal();
      ctx.walk = 0.50 * ctx.walk + 0.50 * innovation;
      rawPrice = baseline + dampening * ctx.walk * (ctx.sigma * 0.4);

      // Settling cadence
      nextDelayMs = 28 + Math.random() * 35;
    }

    // Strict clamping within historical bounds
    const clampedPrice = Math.max(low, Math.min(high, rawPrice));

    // Pip step quantization
    const quantizedPrice = quantizePrice(clampedPrice, state.minMove);
    ctx.lastEmittedPrice = quantizedPrice;

    // Speed-scaled pacing
    const speedScale = Math.max(0.1, state.speed);
    ctx.nextTickTime = now + Math.max(10, Math.floor(nextDelayMs / speedScale));

    return quantizedPrice;
  }

  /** Backwards compatibility alias for stepOrderFlow */
  stepMicrostructure(
    state: IntraBarState,
    elapsed: number,
    ctx: MarkovContext,
    now: number,
  ): number {
    return this.stepOrderFlow(state, elapsed, ctx, now);
  }

  /**
   * Feed a new candle to the generator.
   *
   * @param candle [timestamp, open, high, low, close, volume]
   * @param speed Current playback speed (e.g. 0.25, 0.5, 1.0, 2.0)
   * @param manualStep True when triggered by single step button click
   * @param minMove Optional instrument pip increment for quantization
   * @param ltfSlice Optional real historical lower-timeframe bars within this candle
   */
  feed(
    candle: CompactCandleRow,
    speed: number,
    manualStep = false,
    minMove?: number,
    ltfSlice?: CompactCandleRow[],
  ): void {
    // 1. Immediately finalize any previous running candle so no state is ever dropped
    this.flush();

    // 2. Adaptive speed fallback (> 2.0x) or Instant mode: bypass simulation
    const canInterpolate =
      speed <= 2.0 &&
      this.mode !== 'instant' &&
      typeof requestAnimationFrame === 'function';

    if (!canInterpolate) {
      this.lastStatus = {
        mode: this.mode,
        effectiveMode: 'instant',
        isFallback: this.mode !== 'instant',
        ltfBarsCount: 0,
      };
      this.config.onCommit(candle);
      return;
    }

    const [timestamp, open, high, low, close, volume] = candle;

    // 4 Key points: Open -> Extrema 1 -> Extrema 2 -> Close
    const isBullish = close >= open;
    const p0 = open;
    const p1 = isBullish ? low : high;
    const p2 = isBullish ? high : low;
    const p3 = close;

    // Allocate 95% of nominal step interval so candle comfortably settles just before next step
    const nominalInterval = Math.max(50, Math.floor(1000 / Math.max(0.01, speed)));
    const durationMs = manualStep
      ? Math.min(260, Math.max(180, Math.floor(nominalInterval * 0.25)))
      : Math.floor(nominalInterval * 0.95);

    const effectiveMinMove =
      minMove && minMove > 0
        ? minMove
        : this.defaultMinMove > 0
          ? this.defaultMinMove
          : detectPricePrecision(close).minMove;

    const state: IntraBarState = {
      candle,
      speed,
      minMove: effectiveMinMove,
      durationMs,
      startTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };

    this.currentTarget = candle;
    let highestSoFar = open;
    let lowestSoFar = open;

    // Initial micro-tick: candle opens at open price
    this.config.onMicroTick([timestamp, open, highestSoFar, lowestSoFar, open, 0], open);

    const hasValidLTF = Boolean(ltfSlice && ltfSlice.length > 1);
    const effectiveMode: FormationMode =
      this.mode === 'ltf' && !hasValidLTF
        ? 'orderflow' // Graceful fallback if LTF slice is not downloaded/available
        : this.mode;

    this.lastStatus = {
      mode: this.mode,
      effectiveMode,
      isFallback: this.mode === 'ltf' && !hasValidLTF,
      ltfBarsCount: ltfSlice ? ltfSlice.length : 0,
    };

    const ltfCtx: LTFContext = {
      slice: ltfSlice || [],
      totalSteps: ltfSlice ? ltfSlice.length : 0,
      lastStepIndex: 0,
    };

    // Volatility magnitude (sigma) based on bar range & minMove
    const barRange = high - low;
    const pip = effectiveMinMove;
    const sigma = barRange > 0
      ? Math.min(barRange * 0.08, Math.max(pip * 1.5, pip * 3.0))
      : 0;

    const markovCtx: MarkovContext = {
      phase: 'ACCUMULATION',
      walk: 0,
      sigma,
      nextTickTime: state.startTime,
      p0,
      p1,
      p2,
      p3,
      lastEmittedPrice: open,
      burstRemaining: 0,
      volumeProgress: 0,
    };

    const step = (now: number) => {
      const elapsed = Math.max(0, now - state.startTime);
      const progress = Math.min(1, elapsed / state.durationMs);

      if (progress >= 1) {
        this.activeRafId = null;
        this.currentTarget = null;
        this.config.onCommit(candle);
        return;
      }

      if (effectiveMode === 'ltf' && hasValidLTF) {
        const result = this.stepLTF(state, elapsed, ltfCtx);
        this.config.onMicroTick(result.candle, result.price);
      } else {
        // Mode 2: Order Flow
        if (now < markovCtx.nextTickTime) {
          this.activeRafId = requestAnimationFrame(step);
          return;
        }
        const currentPrice = this.stepOrderFlow(state, elapsed, markovCtx, now);
        highestSoFar = Math.max(highestSoFar, currentPrice);
        lowestSoFar = Math.min(lowestSoFar, currentPrice);
        const curVolume = Math.round(volume * markovCtx.volumeProgress);

        this.config.onMicroTick(
          [timestamp, open, highestSoFar, lowestSoFar, currentPrice, curVolume],
          currentPrice,
        );
      }

      this.activeRafId = requestAnimationFrame(step);
    };

    this.activeRafId = requestAnimationFrame(step);
  }

  /**
   * Finalize the in-flight candle immediately with its exact target data
   * (invoked on pause, user step, or arrival of a new candle).
   */
  flush(): void {
    if (this.activeRafId !== null) {
      cancelAnimationFrame(this.activeRafId);
      this.activeRafId = null;
    }
    if (this.currentTarget !== null) {
      const target = this.currentTarget;
      this.currentTarget = null;
      this.config.onCommit(target);
    }
  }

  /**
   * Cancel without committing in-flight candle (invoked on reset or backward jump).
   */
  cancel(): void {
    if (this.activeRafId !== null) {
      cancelAnimationFrame(this.activeRafId);
      this.activeRafId = null;
    }
    this.currentTarget = null;
  }
}
