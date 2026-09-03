import type { PythonBridge } from '../bridge/python-bridge';
import type { ChartManager } from '../chart/chart-manager';
import type {
  ActiveIndicator,
  IndicatorCalculationResult,
  IndicatorMetadata,
} from './indicator-types';

const PALETTE = [
  '#2962ff', // blue
  '#f23645', // red
  '#089981', // green
  '#ff9800', // orange
  '#ab47bc', // purple
  '#00bcd4', // cyan
  '#e91e63', // pink
  '#ffeb3b', // yellow
];

export class IndicatorManager {
  private catalog: IndicatorMetadata[] = [];
  private activeIndicators = new Map<string, ActiveIndicator>();
  private lineDataCache = new Map<string, { time: number; value: number }[]>();
  private colorIndex = 0;
  private currentSymbol = '';
  private currentTimeframe = '1H';

  constructor(
    private readonly bridge: PythonBridge | null,
    private readonly chart: ChartManager,
    private readonly onActiveChange: (active: ActiveIndicator[]) => void,
  ) {}

  async init(): Promise<void> {
    if (!this.bridge) return;
    try {
      const res = await this.bridge.callJson<{ ok: boolean; data?: IndicatorMetadata[] }>(
        'getIndicatorCatalog',
        {},
      );
      if (res.ok && Array.isArray(res.data)) {
        this.catalog = res.data;
      }
    } catch {
      this.catalog = [];
    }
  }

  getCatalog(): IndicatorMetadata[] {
    return this.catalog;
  }

  getActive(): ActiveIndicator[] {
    return Array.from(this.activeIndicators.values());
  }

  setContext(symbol: string, timeframe: string): void {
    if (this.currentSymbol !== symbol || this.currentTimeframe !== timeframe) {
      this.invalidateCaches();
    }
    this.currentSymbol = symbol;
    this.currentTimeframe = timeframe;
  }

  invalidateCaches(): void {
    this.lineDataCache.clear();
  }

  async addIndicator(name: string, customParams?: Record<string, unknown>): Promise<string | null> {
    const meta = this.catalog.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!meta) return null;

    const id = `${name}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const params = { ...meta.default_params, ...(customParams || {}) };

    const colors: Record<string, string> = {};
    const baseColor = PALETTE[this.colorIndex % PALETTE.length];
    this.colorIndex++;
    colors['default'] = baseColor;

    const active: ActiveIndicator = {
      id,
      name: meta.name,
      display_name: meta.display_name,
      overlay: meta.overlay,
      params,
      visible: true,
      colors,
    };

    this.activeIndicators.set(id, active);
    this.onActiveChange(this.getActive());
    await this.calculateAndRender(active);
    return id;
  }

  removeIndicator(id: string): void {
    const active = this.activeIndicators.get(id);
    if (!active) return;

    // Remove all associated line series and clear caches
    for (const lineKey of Object.keys(active.colors)) {
      const seriesId = `${id}_${lineKey}`;
      this.chart.removeIndicatorSeries(seriesId);
      this.lineDataCache.delete(seriesId);
    }
    this.chart.removeIndicatorSeries(id);
    this.lineDataCache.delete(id);

    this.activeIndicators.delete(id);
    this.onActiveChange(this.getActive());
  }

  async toggleVisibility(id: string): Promise<void> {
    const active = this.activeIndicators.get(id);
    if (!active) return;

    active.visible = !active.visible;
    if (!active.visible) {
      for (const lineKey of Object.keys(active.colors)) {
        this.chart.removeIndicatorSeries(`${id}_${lineKey}`);
      }
      this.chart.removeIndicatorSeries(id);
    } else {
      await this.calculateAndRender(active);
    }
    this.onActiveChange(this.getActive());
  }

  async recalculateAll(opts?: { incremental?: boolean }): Promise<void> {
    const incremental = opts?.incremental ?? false;
    for (const active of this.activeIndicators.values()) {
      if (active.visible) {
        await this.calculateAndRender(active, incremental);
      }
    }
  }

  private async calculateAndRender(active: ActiveIndicator, incremental = false): Promise<void> {
    if (!this.bridge) return;

    try {
      const hasCache = Array.from(this.lineDataCache.keys()).some(
        (k) => k === active.id || k.startsWith(`${active.id}_`),
      );
      const useIncremental = incremental && hasCache;

      const payload: Record<string, unknown> = {
        indicator_name: active.name,
        symbol: this.currentSymbol,
        timeframe: this.currentTimeframe,
        params: active.params,
      };
      if (useIncremental) {
        payload.last_n = 2;
      }

      const res = await this.bridge.callJson<{ ok: boolean; data?: IndicatorCalculationResult }>(
        'calculateIndicator',
        payload,
      );

      if (!res.ok || !res.data) return;

      const result = res.data;
      const timestamps = result.timestamps;
      const lineKeys = Object.keys(result.lines);

      lineKeys.forEach((lineKey, idx) => {
        const seriesId = lineKeys.length === 1 ? active.id : `${active.id}_${lineKey}`;
        const color = PALETTE[(this.colorIndex + idx) % PALETTE.length];
        active.colors[lineKey] = color;

        const lineValues = result.lines[lineKey];
        const newPoints: { time: number; value: number }[] = [];

        for (let i = 0; i < timestamps.length; i++) {
          const val = lineValues[i];
          if (val !== null && val !== undefined) {
            newPoints.push({ time: timestamps[i], value: val });
          }
        }

        let seriesData: { time: number; value: number }[];
        const cached = this.lineDataCache.get(seriesId);

        if (useIncremental && cached && cached.length > 0) {
          const merged = [...cached];
          for (const pt of newPoints) {
            const existingIdx = merged.findIndex((m) => m.time === pt.time);
            if (existingIdx >= 0) {
              merged[existingIdx] = pt;
            } else if (merged.length === 0 || pt.time > merged[merged.length - 1].time) {
              merged.push(pt);
            }
          }
          seriesData = merged;
        } else {
          seriesData = newPoints;
        }

        this.lineDataCache.set(seriesId, seriesData);

        const title = lineKeys.length === 1 ? active.display_name : `${active.display_name} (${lineKey})`;
        this.chart.addIndicatorLineSeries(seriesId, color, active.overlay, title);
        this.chart.setIndicatorLineData(seriesId, seriesData);
      });
    } catch {
      // Ignore calculation errors gracefully
    }
  }
}
