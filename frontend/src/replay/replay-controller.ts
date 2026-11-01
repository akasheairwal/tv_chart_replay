import type { PythonBridge } from '../bridge/python-bridge';
import type { CompactCandleRow } from '../chart/candle-series';
import type { ChartManager } from '../chart/chart-manager';
import { detectPricePrecision } from '../chart/chart-manager';
import { getTimeframeSeconds } from '../drawings/drawing-engine';
import { SubTickGenerator, type FormationMode, type FormationStatus } from './sub-tick-generator';

export type { FormationMode, FormationStatus };

export interface ReplayFormationInfo {
  mode: FormationMode;
  effectiveMode: FormationMode;
  isFallback: boolean;
  ltfBarsCount: number;
  ltfTimeframe: string | null;
  recommendedLTF: string | null;
  reason?: string;
}

/**
 * Maps Higher Timeframe (HTF) to recommended Lower Timeframe (LTF) for ground-truth replay.
 * - 1M / 1W / 1D -> 1H
 * - 4H / 6H / 12H -> 15m
 * - 1H / 2H -> 1m
 * - 2m - 45m -> 1m
 * - 1m -> null (Base timeframe, cannot be expanded further)
 */
export function getRecommendedLTFTimeframe(htf: string): string | null {
  const clean = (htf || '1H').trim();
  const tfSec = getTimeframeSeconds(clean);

  if (tfSec >= 86400) {
    return '1H';
  } else if (tfSec >= 14400) {
    return '15m';
  } else if (tfSec >= 1800) {
    return '1m';
  } else if (tfSec > 60) {
    return '1m';
  }
  return null;
}

export interface ReplayState {
  symbol: string;
  timeframe: string;
  status: 'IDLE' | 'PAUSED' | 'PLAYING' | 'FINISHED';
  current_index: number;
  start_index: number;
  end_index: number;
  warmup_candles: number;
  speed: number;
  current_timestamp: number;
  total_candles: number;
  visible_count: number;
}

interface ReplayResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface ReplayInitData {
  state: ReplayState;
  candles: CompactCandleRow[];
}

export class ReplayController {
  private currentState: ReplayState | null = null;
  private activeSpeed = 1.0;
  private browserCandles: CompactCandleRow[] = [];
  private browserTimer: ReturnType<typeof setInterval> | null = null;
  private readonly subTickGenerator: SubTickGenerator;
  private ltfCandles: CompactCandleRow[] = [];
  private ltfTimeframe: string | null = null;

  constructor(
    private readonly bridge: PythonBridge | null,
    private readonly chart: ChartManager,
    private readonly onStateChange: (state: ReplayState) => void,
    private readonly onPriceTick?: (price: number) => void,
  ) {
    const savedMode = (typeof localStorage !== 'undefined'
      ? localStorage.getItem('tv_replay_formation_mode')
      : null) as string | null;
    let initialMode: FormationMode = 'ltf';
    if (savedMode === 'instant') {
      initialMode = 'instant';
    } else if (savedMode === 'orderflow' || savedMode === 'microstructure') {
      initialMode = 'orderflow';
    } else if (savedMode === 'ltf') {
      initialMode = 'ltf';
    } else {
      initialMode = 'ltf';
    }

    try {
      if (typeof localStorage !== 'undefined' && savedMode && savedMode !== initialMode) {
        localStorage.setItem('tv_replay_formation_mode', initialMode);
      }
    } catch {
      /* ignore */
    }

    this.subTickGenerator = new SubTickGenerator({
      mode: initialMode,
      onMicroTick: (candle, price) => {
        if (typeof (this.chart as any).updateCandle === 'function') {
          (this.chart as any).updateCandle(candle);
        } else {
          this.chart.appendCandle(candle);
        }
        if (this.onPriceTick) {
          this.onPriceTick(price);
        }
      },
      onCommit: (candle) => {
        this.chart.appendCandle(candle);
        if (typeof (this.chart as any).triggerCameraFollow === 'function') {
          (this.chart as any).triggerCameraFollow();
        }
        if (this.onPriceTick) {
          this.onPriceTick(candle[4]);
        }
      },
    });
    this.subscribeEvents();
  }

  /** Feed a candle through the adaptive sub-tick generator */
  feedCandle(candle: CompactCandleRow, manualStep = false): void {
    const symbol = this.currentState?.symbol || '';
    const minMove =
      (typeof (this.chart as any)?.getMinMove === 'function'
        ? (this.chart as any).getMinMove(candle[4])
        : null) ?? detectPricePrecision(candle[4], symbol).minMove;
    const tf = this.currentState?.timeframe || '1H';
    const tfSec = getTimeframeSeconds(tf);
    const ltfSlice = this.getLTFSliceForCandle(candle[0], tfSec);
    this.subTickGenerator.feed(candle, this.activeSpeed, manualStep, minMove, ltfSlice);
  }

  /**
   * Slices cached LTF candles falling within the duration of an HTF candle [candleStart_s, candleStart_s + tfSec).
   */
  getLTFSliceForCandle(candleStart_s: number, tfSec: number): CompactCandleRow[] {
    if (!this.ltfCandles || this.ltfCandles.length === 0 || tfSec <= 0) {
      return [];
    }
    const candleEnd_s = candleStart_s + tfSec;

    let low = 0;
    let high = this.ltfCandles.length - 1;
    let startIndex = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.ltfCandles[mid][0] >= candleStart_s) {
        startIndex = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    if (startIndex === -1 || this.ltfCandles[startIndex][0] >= candleEnd_s) {
      return [];
    }

    const slice: CompactCandleRow[] = [];
    for (let i = startIndex; i < this.ltfCandles.length; i++) {
      const bar = this.ltfCandles[i];
      if (bar[0] >= candleEnd_s) break;
      slice.push(bar);
    }
    return slice;
  }

  setLTFCandles(candles: CompactCandleRow[], timeframe?: string): void {
    this.ltfCandles = candles.slice().sort((a, b) => a[0] - b[0]);
    if (timeframe) {
      this.ltfTimeframe = timeframe;
    }
  }

  getLTFCandles(): CompactCandleRow[] {
    return this.ltfCandles;
  }

  getLTFTimeframe(): string | null {
    return this.ltfTimeframe;
  }

  async preloadLTFData(symbol: string, htf: string, start_s?: number, end_s?: number): Promise<void> {
    if (!this.bridge) return;
    const ltfTf = getRecommendedLTFTimeframe(htf);
    if (!ltfTf) {
      this.ltfCandles = [];
      this.ltfTimeframe = null;
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        symbol,
        timeframe: ltfTf,
      };
      if (start_s !== undefined) payload.start_s = start_s;
      if (end_s !== undefined) payload.end_s = end_s;

      const res = await this.bridge.callJson<ReplayResponse<{ rows: CompactCandleRow[] }>>(
        'loadHistory',
        payload,
      );
      if (res.ok && res.data?.rows) {
        this.setLTFCandles(res.data.rows, ltfTf);
      }
    } catch (err) {
      console.warn('[ReplayController] Failed to preload LTF candles for', symbol, ltfTf, err);
    }
  }

  get formationMode(): FormationMode {
    return this.subTickGenerator.getFormationMode();
  }

  getFormationStatus(): ReplayFormationInfo {
    const status = this.subTickGenerator.getFormationStatus();
    const htf = this.currentState?.timeframe || '1H';
    const recommendedLTF = getRecommendedLTFTimeframe(htf);

    let reason: string | undefined;
    if (this.formationMode === 'ltf') {
      if (!this.bridge && this.ltfCandles.length === 0) {
        reason = 'Browser preview mode (no local dataset)';
      } else if (!recommendedLTF) {
        reason = `Base timeframe (${htf}) cannot be expanded further`;
      } else if (this.ltfCandles.length === 0) {
        reason = `No ${recommendedLTF} data downloaded for ${this.currentState?.symbol || ''}`;
      } else if (status.isFallback) {
        reason = `No ${recommendedLTF} bars in candle time range`;
      }
    }

    return {
      mode: this.formationMode,
      effectiveMode: status.effectiveMode,
      isFallback: status.isFallback,
      ltfBarsCount: status.ltfBarsCount,
      ltfTimeframe: this.ltfTimeframe || recommendedLTF,
      recommendedLTF,
      reason,
    };
  }

  setFormationMode(mode: FormationMode): void {
    this.subTickGenerator.setFormationMode(mode);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('tv_replay_formation_mode', mode);
      }
    } catch {
      /* ignore */
    }
  }

  get state(): ReplayState | null {
    return this.currentState;
  }

  get isPlaying(): boolean {
    return this.currentState?.status === 'PLAYING';
  }

  get isFinished(): boolean {
    return this.currentState?.status === 'FINISHED';
  }

  get currentSpeed(): number {
    return this.activeSpeed;
  }

  /** Set candles for browser preview mode (when bridge is null) */
  setBrowserCandles(candles: CompactCandleRow[], warmup = 100): void {
    this.browserCandles = candles;
    const total = candles.length;
    const startIdx = Math.min(warmup, Math.max(0, total - 1));
    this.currentState = {
      symbol: 'EURUSD',
      timeframe: '1H',
      status: 'PAUSED',
      current_index: startIdx,
      start_index: startIdx,
      end_index: Math.max(0, total - 1),
      warmup_candles: startIdx,
      speed: this.activeSpeed,
      current_timestamp: candles[startIdx] ? candles[startIdx][0] : 0,
      total_candles: total,
      visible_count: startIdx + 1,
    };

    // Synthesize realistic 1m lower-timeframe slices for browser preview mode
    const syntheticLTF: CompactCandleRow[] = [];
    for (const c of candles) {
      const [ts, o, h, l, cl, vol] = c;
      const count = 60; // 60 1m bars per 1H candle
      const volPerBar = Math.max(1, Math.floor((vol || 600) / count));
      const isBull = cl >= o;
      const p1 = isBull ? l : h;
      const p2 = isBull ? h : l;
      let prevClose = o;

      for (let i = 0; i < count; i++) {
        const barTs = ts + i * 60;
        const progress = i / (count - 1);
        let target: number;
        if (progress < 0.25) {
          target = o + (p1 - o) * (progress / 0.25);
        } else if (progress < 0.75) {
          target = p1 + (p2 - p1) * ((progress - 0.25) / 0.5);
        } else {
          target = p2 + (cl - p2) * ((progress - 0.75) / 0.25);
        }
        const bOpen = prevClose;
        const bClose = i === count - 1 ? cl : Number(target.toFixed(5));
        const bHigh = Math.max(bOpen, bClose);
        const bLow = Math.min(bOpen, bClose);
        prevClose = bClose;
        syntheticLTF.push([barTs, bOpen, bHigh, bLow, bClose, volPerBar]);
      }
    }
    this.setLTFCandles(syntheticLTF, '1m');

    this.onStateChange(this.currentState);
  }

  async createReplay(
    symbol: string,
    timeframe: string,
    warmup_candles = 100,
    speed?: number,
  ): Promise<void> {
    const effectiveSpeed = speed ?? this.activeSpeed;
    if (!this.bridge) {
      if (this.browserCandles.length > 0) {
        this.setBrowserCandles(this.browserCandles, warmup_candles);
      }
      return;
    }
    const res = await this.bridge.callJson<ReplayResponse<ReplayInitData>>('createReplay', {
      symbol,
      timeframe,
      warmup_candles,
      speed: effectiveSpeed,
    });
    if (res.ok && res.data) {
      this.currentState = res.data.state;
      this.activeSpeed = res.data.state.speed;
      this.chart.loadHistory(res.data.candles);
      this.onStateChange(this.currentState);
      void this.preloadLTFData(symbol, timeframe);
    }
  }

  async createRandomReplay(
    symbol: string,
    timeframe: string,
    warmup_candles = 250,
    replay_length = 500,
    speed?: number,
  ): Promise<void> {
    const effectiveSpeed = speed ?? this.activeSpeed;
    if (!this.bridge) {
      if (this.browserCandles.length > 0) {
        const total = this.browserCandles.length;
        const maxStart = Math.max(0, total - replay_length - 10);
        const startIdx = Math.floor(Math.random() * Math.max(1, maxStart)) + 20;
        this.currentState = {
          symbol,
          timeframe,
          status: 'PAUSED',
          current_index: startIdx,
          start_index: startIdx,
          end_index: Math.min(total - 1, startIdx + replay_length),
          warmup_candles,
          speed: effectiveSpeed,
          current_timestamp: this.browserCandles[startIdx] ? this.browserCandles[startIdx][0] : 0,
          total_candles: total,
          visible_count: startIdx + 1,
        };
        this.chart.loadHistory(this.browserCandles.slice(0, startIdx + 1));
        this.onStateChange(this.currentState);
      }
      return;
    }
    const res = await this.bridge.callJson<ReplayResponse<ReplayInitData>>('createRandomReplay', {
      symbol,
      timeframe,
      warmup_candles,
      replay_length,
      speed: effectiveSpeed,
    });
    if (res.ok && res.data) {
      this.currentState = res.data.state;
      this.activeSpeed = res.data.state.speed;
      this.chart.loadHistory(res.data.candles);
      this.onStateChange(this.currentState);
      void this.preloadLTFData(symbol, timeframe);
    }
  }

  async togglePlayPause(): Promise<void> {
    if (this.isPlaying) {
      await this.pause();
    } else {
      await this.play();
    }
  }

  async play(): Promise<void> {
    if (this.isFinished) {
      await this.reset();
    }

    // Immediate optimistic state update
    if (this.currentState) {
      this.currentState = { ...this.currentState, status: 'PLAYING' };
      this.onStateChange(this.currentState);
    }

    if (this.bridge) {
      try {
        const res = await this.bridge.callJson<ReplayResponse<ReplayState>>('playReplay', {});
        if (res.ok && res.data) {
          this.currentState = res.data;
          this.activeSpeed = res.data.speed;
          this.onStateChange(this.currentState);
        }
      } catch (err) {
        console.error('[ReplayController] playReplay failed:', err);
      }
    } else {
      this.startBrowserPlayback();
    }
  }

  async pause(): Promise<void> {
    // 1. Immediately halt any browser playback timer and flush in-flight sub-tick tween
    this.stopBrowserPlayback();
    this.subTickGenerator.flush();

    // 2. Immediate optimistic state update to PAUSED so UI flips right away
    if (this.currentState) {
      this.currentState = { ...this.currentState, status: 'PAUSED' };
      this.onStateChange(this.currentState);
    }

    // 3. Confirm with Python backend
    if (this.bridge) {
      try {
        const res = await this.bridge.callJson<ReplayResponse<ReplayState>>('pauseReplay', {});
        if (res.ok && res.data && res.data.status) {
          this.currentState = res.data;
          this.activeSpeed = res.data.speed;
          this.onStateChange(this.currentState);
        }
      } catch (err) {
        console.error('[ReplayController] pauseReplay failed:', err);
      }
    }
  }

  async stepForward(step = 1): Promise<void> {
    if (!this.bridge) {
      if (!this.currentState || this.browserCandles.length === 0) return;
      const oldIdx = this.currentState.current_index;
      const newIdx = Math.min(this.currentState.end_index, oldIdx + Math.max(1, step));
      if (newIdx === oldIdx) {
        this.stopBrowserPlayback();
        this.currentState = { ...this.currentState, status: 'FINISHED' };
        this.onStateChange(this.currentState);
        return;
      }
      if (newIdx - oldIdx === 1) {
        this.feedCandle(this.browserCandles[newIdx], !this.isPlaying);
      } else {
        for (let i = oldIdx + 1; i < newIdx; i++) {
          this.chart.appendCandle(this.browserCandles[i]);
        }
        this.feedCandle(this.browserCandles[newIdx], !this.isPlaying);
      }
      const isFin = newIdx >= this.currentState.end_index;
      if (isFin) this.stopBrowserPlayback();
      this.currentState = {
        ...this.currentState,
        current_index: newIdx,
        current_timestamp: this.browserCandles[newIdx][0],
        status: isFin ? 'FINISHED' : this.currentState.status,
        visible_count: newIdx + 1,
      };
      this.onStateChange(this.currentState);
      return;
    }

    const res = await this.bridge.callJson<ReplayResponse<{ state: ReplayState; candles: CompactCandleRow[] }>>(
      'replayNext',
      step.toString(),
    );
    if (res.ok && res.data) {
      this.currentState = res.data.state;
      this.activeSpeed = res.data.state.speed;
      const candles = res.data.candles;
      if (candles.length === 1) {
        this.feedCandle(candles[0], !this.isPlaying);
      } else if (candles.length > 1) {
        for (let i = 0; i < candles.length - 1; i++) {
          this.chart.appendCandle(candles[i]);
        }
        this.feedCandle(candles[candles.length - 1], !this.isPlaying);
      }
      this.onStateChange(this.currentState);
    }
  }

  async stepBackward(step = 1): Promise<void> {
    this.subTickGenerator.cancel();
    if (!this.bridge) {
      if (!this.currentState || this.browserCandles.length === 0) return;
      this.stopBrowserPlayback();
      const newIdx = Math.max(0, this.currentState.current_index - Math.max(1, step));
      this.chart.loadHistory(this.browserCandles.slice(0, newIdx + 1));
      this.currentState = {
        ...this.currentState,
        current_index: newIdx,
        current_timestamp: this.browserCandles[newIdx][0],
        status: 'PAUSED',
        visible_count: newIdx + 1,
      };
      this.onStateChange(this.currentState);
      return;
    }

    const res = await this.bridge.callJson<ReplayResponse<{ state: ReplayState; candles: CompactCandleRow[] }>>(
      'replayPrevious',
      step.toString(),
    );
    this.applyReplayResponse(res);
  }

  async jumpTo(target: number): Promise<void> {
    this.subTickGenerator.cancel();
    if (!this.bridge) {
      if (!this.currentState || this.browserCandles.length === 0) return;
      this.stopBrowserPlayback();
      let targetIdx = target;
      if (target > 1000000000) {
        targetIdx = this.browserCandles.findIndex((c) => c[0] >= target);
        if (targetIdx < 0) targetIdx = this.browserCandles.length - 1;
      }
      targetIdx = Math.max(0, Math.min(targetIdx, this.browserCandles.length - 1));
      this.chart.loadHistory(this.browserCandles.slice(0, targetIdx + 1));
      this.currentState = {
        ...this.currentState,
        current_index: targetIdx,
        current_timestamp: this.browserCandles[targetIdx][0],
        status: targetIdx >= this.currentState.end_index ? 'FINISHED' : 'PAUSED',
        visible_count: targetIdx + 1,
      };
      this.onStateChange(this.currentState);
      return;
    }

    const res = await this.bridge.callJson<ReplayResponse<{ state: ReplayState; candles: CompactCandleRow[] }>>(
      'replayJumpTo',
      target.toString(),
    );
    this.applyReplayResponse(res);
  }

  async reset(): Promise<void> {
    this.subTickGenerator.cancel();
    if (!this.bridge) {
      if (!this.currentState || this.browserCandles.length === 0) return;
      this.stopBrowserPlayback();
      const startIdx = this.currentState.start_index;
      this.chart.loadHistory(this.browserCandles.slice(0, startIdx + 1));
      this.currentState = {
        ...this.currentState,
        current_index: startIdx,
        current_timestamp: this.browserCandles[startIdx][0],
        status: 'PAUSED',
        visible_count: startIdx + 1,
      };
      this.onStateChange(this.currentState);
      return;
    }

    const res = await this.bridge.callJson<ReplayResponse<{ state: ReplayState; candles: CompactCandleRow[] }>>(
      'replayReset',
      {},
    );
    this.applyReplayResponse(res);
  }

  async setSpeed(speed: number): Promise<void> {
    this.activeSpeed = speed;
    if (speed > 2.0) {
      this.subTickGenerator.flush();
    }
    if (this.currentState) {
      this.currentState = { ...this.currentState, speed };
      this.onStateChange(this.currentState);
    }
    if (this.browserTimer) {
      this.stopBrowserPlayback();
      this.startBrowserPlayback();
    }
    if (this.bridge) {
      try {
        const res = await this.bridge.callJson<ReplayResponse<ReplayState>>(
          'setReplaySpeed',
          speed.toString(),
        );
        if (res.ok && res.data) {
          this.currentState = res.data;
          this.activeSpeed = res.data.speed;
          this.onStateChange(this.currentState);
        }
      } catch {
        /* ignore */
      }
    }
  }

  private startBrowserPlayback(): void {
    this.stopBrowserPlayback();
    const intervalMs = Math.max(16, Math.floor(1000 / this.activeSpeed));
    this.browserTimer = setInterval(() => {
      void this.stepForward(1);
    }, intervalMs);
  }

  private stopBrowserPlayback(): void {
    if (this.browserTimer !== null) {
      clearInterval(this.browserTimer);
      this.browserTimer = null;
    }
  }

  private subscribeEvents(): void {
    if (!this.bridge) return;

    this.bridge.onEvent('replay.candle', (payload: unknown) => {
      const data = payload as { candle: CompactCandleRow; index: number };
      if (data && data.candle) {
        this.feedCandle(data.candle, false);
      }
    });

    const handleState = (payload: unknown) => {
      const state = payload as ReplayState;
      if (state) {
        this.currentState = state;
        this.onStateChange(state);
      }
    };

    this.bridge.onEvent('replay.state', handleState);
    this.bridge.onEvent('replay.paused', handleState);
    this.bridge.onEvent('replay.started', handleState);
    this.bridge.onEvent('replay.finished', handleState);
  }

  private applyReplayResponse(res: ReplayResponse<{ state: ReplayState; candles: CompactCandleRow[] }>): void {
    if (res.ok && res.data) {
      this.currentState = res.data.state;
      this.activeSpeed = res.data.state.speed;
      this.chart.loadHistory(res.data.candles);
      this.onStateChange(this.currentState);
    }
  }
}

