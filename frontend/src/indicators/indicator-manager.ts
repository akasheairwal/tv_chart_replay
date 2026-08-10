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
    this.currentSymbol = symbol;
    this.currentTimeframe = timeframe;
  }

  async addIndicator(name: string, customParams?: Record<string, unknown>): Promise<void> {
    const meta = this.catalog.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!meta) return;

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
  }

  removeIndicator(id: string): void {
    const active = this.activeIndicators.get(id);
    if (!active) return;

    // Remove all associated line series
    for (const lineKey of Object.keys(active.colors)) {
      this.chart.removeIndicatorSeries(`${id}_${lineKey}`);
    }
    this.chart.removeIndicatorSeries(id);

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

  async recalculateAll(): Promise<void> {
    for (const active of this.activeIndicators.values()) {
      if (active.visible) {
        await this.calculateAndRender(active);
      }
    }
  }

  private async calculateAndRender(active: ActiveIndicator): Promise<void> {
    if (!this.bridge) return;

    try {
      const res = await this.bridge.callJson<{ ok: boolean; data?: IndicatorCalculationResult }>(
        'calculateIndicator',
        {
          indicator_name: active.name,
          symbol: this.currentSymbol,
          timeframe: this.currentTimeframe,
          params: active.params,
        },
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
        const seriesData: { time: number; value: number }[] = [];

        for (let i = 0; i < timestamps.length; i++) {
          const val = lineValues[i];
          if (val !== null && val !== undefined) {
            seriesData.push({ time: timestamps[i], value: val });
          }
        }

        const title = lineKeys.length === 1 ? active.display_name : `${active.display_name} (${lineKey})`;
        this.chart.addIndicatorLineSeries(seriesId, color, active.overlay, title);
        this.chart.setIndicatorLineData(seriesId, seriesData);
      });
    } catch {
      // Ignore calculation errors gracefully
    }
  }
}
