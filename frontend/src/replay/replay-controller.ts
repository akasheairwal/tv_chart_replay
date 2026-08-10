import type { PythonBridge } from '../bridge/python-bridge';
import type { CompactCandleRow } from '../chart/candle-series';
import type { ChartManager } from '../chart/chart-manager';

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

  constructor(
    private readonly bridge: PythonBridge | null,
    private readonly chart: ChartManager,
    private readonly onStateChange: (state: ReplayState) => void,
  ) {
    this.subscribeEvents();
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
    // 1. Immediately halt any browser playback timer
    this.stopBrowserPlayback();

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
      for (let i = oldIdx + 1; i <= newIdx; i++) {
        this.chart.appendCandle(this.browserCandles[i]);
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
      for (const candle of res.data.candles) {
        this.chart.appendCandle(candle);
      }
      this.onStateChange(this.currentState);
    }
  }

  async stepBackward(step = 1): Promise<void> {
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
    if (res.ok && res.data) {
      this.currentState = res.data.state;
      this.activeSpeed = res.data.state.speed;
      this.chart.loadHistory(res.data.candles);
      this.onStateChange(this.currentState);
    }
  }

  async jumpTo(target: number): Promise<void> {
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
    if (res.ok && res.data) {
      this.currentState = res.data.state;
      this.activeSpeed = res.data.state.speed;
      this.chart.loadHistory(res.data.candles);
      this.onStateChange(this.currentState);
    }
  }

  async reset(): Promise<void> {
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
    if (res.ok && res.data) {
      this.currentState = res.data.state;
      this.activeSpeed = res.data.state.speed;
      this.chart.loadHistory(res.data.candles);
      this.onStateChange(this.currentState);
    }
  }

  async setSpeed(speed: number): Promise<void> {
    this.activeSpeed = speed;
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
        this.chart.appendCandle(data.candle);
      }
    });

    this.bridge.onEvent('replay.state', (payload: unknown) => {
      const state = payload as ReplayState;
      if (state) {
        this.currentState = state;
        this.onStateChange(state);
      }
    });

    this.bridge.onEvent('replay.paused', (payload: unknown) => {
      const state = payload as ReplayState;
      if (state) {
        this.currentState = state;
        this.onStateChange(state);
      }
    });

    this.bridge.onEvent('replay.started', (payload: unknown) => {
      const state = payload as ReplayState;
      if (state) {
        this.currentState = state;
        this.onStateChange(state);
      }
    });

    this.bridge.onEvent('replay.finished', (payload: unknown) => {
      const state = payload as ReplayState;
      if (state) {
        this.currentState = state;
        this.onStateChange(state);
      }
    });
  }
}
