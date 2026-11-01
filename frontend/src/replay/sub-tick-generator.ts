import type { CompactCandleRow } from '../chart/candle-series';

export interface SubTickConfig {
  onMicroTick: (candle: CompactCandleRow, price: number) => void;
  onCommit: (candle: CompactCandleRow) => void;
}

/**
 * SubTickGenerator (ADR 0001 - Domain 2)
 *
 * For replay speeds <= 2.0x, decomposes discrete incoming candles into 4 authentic
 * price milestones: Open -> Extrema 1 -> Extrema 2 -> Close, dynamically expanding
 * candle wicks and closing price smoothly across the step interval via an rAF tween.
 *
 * For speeds > 2.0x or non-rAF environments, executes discrete jumps with zero CPU overhead.
 */
export class SubTickGenerator {
  private activeRafId: number | null = null;
  private currentTarget: CompactCandleRow | null = null;

  constructor(private readonly config: SubTickConfig) {}

  /**
   * Whether an intra-bar interpolation tween is currently running.
   */
  get isRunning(): boolean {
    return this.activeRafId !== null;
  }

  /**
   * Feed a new candle to the generator.
   *
   * @param candle [timestamp, open, high, low, close, volume]
   * @param speed Current playback speed (e.g. 0.5, 1.0, 2.0)
   * @param manualStep True when triggered by single step button click
   */
  feed(candle: CompactCandleRow, speed: number, manualStep = false): void {
    // 1. Immediately finalize any previous running candle so no state is ever dropped
    this.flush();

    // 2. Check speed tier: full interpolation at <= 2x speed; discrete jump at > 2x
    const canInterpolate =
      speed <= 2.0 &&
      typeof requestAnimationFrame === 'function';

    if (!canInterpolate) {
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

    // Allocate 88% of nominal step interval so the candle comfortably settles before next step
    const nominalInterval = Math.max(50, Math.floor(1000 / Math.max(0.01, speed)));
    const durationMs = manualStep ? 240 : Math.min(1200, Math.floor(nominalInterval * 0.88));

    this.currentTarget = candle;
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let highestSoFar = Math.max(open, p0);
    let lowestSoFar = Math.min(open, p0);

    // Initial micro-tick: candle opens at open price
    this.config.onMicroTick([timestamp, open, highestSoFar, lowestSoFar, open, 0], open);

    const step = (now: number) => {
      const elapsed = Math.max(0, now - startTime);
      const progress = Math.min(1, elapsed / durationMs);

      // Decompose across 3 segments between the 4 key points: [0, 1/3], [1/3, 2/3], [2/3, 1]
      let currentPrice: number;
      if (progress <= 1 / 3) {
        const t = progress * 3;
        // Ease-in-out cubic
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        currentPrice = p0 + (p1 - p0) * ease;
      } else if (progress <= 2 / 3) {
        const t = (progress - 1 / 3) * 3;
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        currentPrice = p1 + (p2 - p1) * ease;
      } else {
        const t = (progress - 2 / 3) * 3;
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        currentPrice = p2 + (p3 - p2) * ease;
      }

      highestSoFar = Math.max(highestSoFar, currentPrice);
      lowestSoFar = Math.min(lowestSoFar, currentPrice);
      const curVolume = Math.round(volume * progress);

      this.config.onMicroTick(
        [timestamp, open, highestSoFar, lowestSoFar, currentPrice, curVolume],
        currentPrice,
      );

      if (progress < 1) {
        this.activeRafId = requestAnimationFrame(step);
      } else {
        this.activeRafId = null;
        this.currentTarget = null;
        this.config.onCommit(candle);
      }
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

