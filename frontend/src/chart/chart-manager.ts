import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';

import { parseCompactHistory, type CompactCandleRow } from './candle-series';
import { DrawingEngine } from '../drawings/drawing-engine';
import type { DrawingDefinition } from '../drawings/drawing-types';
import type { SlTpModificationRequest } from '../ui/sl-tp-confirm-dialog';

export function detectPricePrecision(samplePrice: number, symbol = ''): {
  precision: number;
  minMove: number;
} {
  const sym = (symbol || '').toUpperCase();
  if (sym.includes('JPY')) {
    return { precision: 3, minMove: 0.001 };
  }
  if (samplePrice <= 0 || isNaN(samplePrice)) {
    return { precision: 5, minMove: 0.00001 };
  }
  if (samplePrice < 0.001) {
    return { precision: 7, minMove: 0.0000001 };
  }
  if (samplePrice < 0.1) {
    return { precision: 6, minMove: 0.000001 };
  }
  if (samplePrice < 10) {
    return { precision: 5, minMove: 0.00001 };
  }
  if (samplePrice < 100) {
    return { precision: 3, minMove: 0.001 };
  }
  return { precision: 2, minMove: 0.01 };
}

export class ChartManager {
  private chart: IChartApi | null = null;
  private candlestickSeries: ISeriesApi<'Candlestick'> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private indicatorSeries = new Map<string, ISeriesApi<'Line'>>();
  private drawingEngine: DrawingEngine | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeRafId: number | null = null;
  private isResizePaused = false;
  private loadingEl: HTMLElement | null = null;
  private currentSymbol = '';
  private candleCount = 0;
  private cameraPanRafId: number | null = null;
  private isUserInteracting = false;
  private onUserPointerDown?: () => void;
  private onUserPointerUp?: () => void;
  private onUserWheel?: () => void;
  private onDimensionsChange?: () => void;
  private onPriceScaleWheel?: (e: WheelEvent) => void;
  private onPriceScaleDblClick?: (e: MouseEvent) => void;

  setOnDimensionsChange(cb: () => void): void {
    this.onDimensionsChange = cb;
  }

  constructor(
    private readonly container: HTMLElement,
    private readonly onDrawingSave?: (d: DrawingDefinition) => void,
    private readonly onDrawingDelete?: (id: string) => void,
    private readonly onDrawingSelect?: (d: DrawingDefinition | null) => void,
    private readonly onToolChange?: (tool: string) => void,
    private readonly onClosePosition?: (positionId: string, currentPrice: number) => void,
    private readonly onModifySlTpRequest?: (req: SlTpModificationRequest) => void,
  ) {}

  getDrawingEngine(): DrawingEngine | null {
    return this.drawingEngine;
  }

  setPositions(positions: import('../trading/trading-types').PositionDefinition[]): void {
    if (this.drawingEngine) {
      this.drawingEngine.setPositions(positions);
    }
  }

  setLatestPrice(price: number): void {
    if (this.drawingEngine) {
      this.drawingEngine.setLatestPrice(price);
    }
  }

  getCurrentSymbol(): string {
    return this.currentSymbol;
  }

  getMinMove(samplePrice?: number): number {
    const p = samplePrice && samplePrice > 0 ? samplePrice : 1.0;
    return detectPricePrecision(p, this.currentSymbol).minMove;
  }

  setSymbol(symbol: string): void {
    this.currentSymbol = symbol;
  }

  init(): void {
    // Clear container
    this.container.innerHTML = '';

    // Loading overlay element
    this.loadingEl = document.createElement('div');
    this.loadingEl.className = 'chart-overlay-message';
    this.loadingEl.style.display = 'none';
    this.container.appendChild(this.loadingEl);

    this.chart = createChart(this.container, {
      width: this.container.clientWidth || 800,
      height: this.container.clientHeight || 500,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#2a2e39' },
        horzLines: { color: '#2a2e39' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
        axisDoubleClickReset: true,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#2a2e39',
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
        autoScale: true,
        visible: true,
        borderVisible: true,
        alignLabels: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.15,
        },
      },
    });

    // Add Candlestick Series with high precision default
    this.candlestickSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      priceFormat: {
        type: 'price',
        precision: 5,
        minMove: 0.00001,
      },
    });

    // Add Volume Histogram Series on bottom 20% margin
    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    this.volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Setup HTML5 Canvas Drawing Overlay (Wave 5 & 6)
    this.drawingEngine = new DrawingEngine(
      this.container,
      this.chart,
      this.candlestickSeries,
      this.onDrawingSave,
      this.onDrawingDelete,
      this.onDrawingSelect,
      this.onToolChange,
      this.onClosePosition,
      this.onModifySlTpRequest,
    );

    // Setup responsive ResizeObserver with requestAnimationFrame debouncing
    // Prevents "ResizeObserver loop completed with undelivered notifications" and GPU thrashing
    this.resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length || !this.chart) return;
      if (this.isResizePaused) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        if (this.resizeRafId !== null) {
          cancelAnimationFrame(this.resizeRafId);
        }
        this.resizeRafId = requestAnimationFrame(() => {
          this.resizeRafId = null;
          if (this.chart && !this.isResizePaused && width > 0 && height > 0) {
            this.chart.applyOptions({ width, height });
            if (this.drawingEngine) {
              this.drawingEngine.resize();
            }
            this.onDimensionsChange?.();
          }
        });
      }
    });

    this.resizeObserver.observe(this.container);

    // Cancel smooth camera panning immediately upon any user touch/mouse/wheel interaction
    this.onUserPointerDown = () => {
      this.isUserInteracting = true;
      this.cancelCameraAnimation();
    };
    this.onUserPointerUp = () => {
      this.isUserInteracting = false;
    };
    this.onUserWheel = () => {
      this.cancelCameraAnimation();
    };

    this.container.addEventListener('pointerdown', this.onUserPointerDown);
    window.addEventListener('pointerup', this.onUserPointerUp);
    this.container.addEventListener('wheel', this.onUserWheel, { passive: true });

    // Intercept wheel events on price scale to zoom price vertically instead of zooming time scale
    this.onPriceScaleWheel = (e: WheelEvent) => {
      if (!this.chart || !this.candlestickSeries) return;
      const table = typeof this.container.querySelector === 'function' ? this.container.querySelector('table') : null;
      if (!table) return;
      const priceScaleTd = table.querySelector('tr:first-child td:last-child') as HTMLElement | null;
      if (!priceScaleTd) return;
      const rect = priceScaleTd.getBoundingClientRect();

      const inPriceScale = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );

      if (inPriceScale) {
        e.preventDefault();
        e.stopPropagation();
        this.cancelCameraAnimation();
        this.zoomPriceScale(e.deltaY, e.clientY);
      }
    };
    this.container.addEventListener('wheel', this.onPriceScaleWheel, { capture: true, passive: false });

    // Double-click on price scale resets auto-scaling
    this.onPriceScaleDblClick = (e: MouseEvent) => {
      const table = typeof this.container.querySelector === 'function' ? this.container.querySelector('table') : null;
      if (!table) return;
      const priceScaleTd = table.querySelector('tr:first-child td:last-child') as HTMLElement | null;
      if (!priceScaleTd) return;
      const rect = priceScaleTd.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        this.setAutoScale(true);
        this.drawingEngine?.redraw();
      }
    };
    this.container.addEventListener('dblclick', this.onPriceScaleDblClick);
  }

  pauseResize(): void {
    this.isResizePaused = true;
    if (this.resizeRafId !== null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }
  }

  resumeResize(): void {
    this.isResizePaused = false;
    this.resize();
  }

  resize(width?: number, height?: number): void {
    const w = width ?? this.container.clientWidth;
    const h = height ?? this.container.clientHeight;
    if (this.chart && w > 0 && h > 0) {
      this.chart.applyOptions({ width: w, height: h });
      if (this.drawingEngine) {
        this.drawingEngine.resize();
      }
      this.onDimensionsChange?.();
    }
  }


  /**
   * Load history compact candle array rows `[[timestamp, o, h, l, c, v], ...]`.
   */
  loadHistory(rows: CompactCandleRow[], symbol?: string): void {
    if (!this.candlestickSeries || !this.volumeSeries || !this.chart) return;

    this.hideLoading();

    if (symbol) {
      this.currentSymbol = symbol;
    }

    if (!rows || rows.length === 0) {
      this.clear();
      this.showLoading('No historical candles available');
      return;
    }

    // Apply dynamic price precision based on the symbol / candle prices
    const lastPrice = rows[rows.length - 1][4];
    const fmt = detectPricePrecision(lastPrice, this.currentSymbol || symbol);
    this.candlestickSeries.applyOptions({
      priceFormat: {
        type: 'price',
        precision: fmt.precision,
        minMove: fmt.minMove,
      },
    });

    const { candles, volumes } = parseCompactHistory(rows);
    this.candlestickSeries.setData(candles);
    this.volumeSeries.setData(volumes);

    this.candleCount = rows.length;
    this.cancelCameraAnimation();
    this.chart.timeScale().fitContent();

    if (this.drawingEngine) {
      this.drawingEngine.setCandleData(rows);
      if (rows.length > 0) {
        this.drawingEngine.setLatestPrice(rows[rows.length - 1][4]);
      }
      this.drawingEngine.redraw();
    }

    requestAnimationFrame(() => {
      this.onDimensionsChange?.();
      if (this.drawingEngine) {
        this.drawingEngine.resize();
        this.drawingEngine.redraw();
      }
    });
  }

  /**
   * Append / update a single candle during replay play/step forward.
   */
  appendCandle(row: CompactCandleRow): void {
    if (!this.candlestickSeries || !this.volumeSeries) return;
    const [timestamp, open, high, low, close, volume] = row;
    const time = timestamp as any;

    this.candlestickSeries.update({
      time,
      open,
      high,
      low,
      close,
    });

    const isUp = close >= open;
    this.volumeSeries.update({
      time,
      value: volume,
      color: isUp ? 'rgba(8, 153, 129, 0.5)' : 'rgba(242, 54, 69, 0.5)',
    });

    if (this.drawingEngine) {
      this.drawingEngine.appendCandle(row);
      this.drawingEngine.setLatestPrice(close);
    }
    this.candleCount++;
  }

  /**
   * Update the current forming candle during intra-bar interpolation (ADR 0001 - Domain 2).
   * Updates candlestick and volume series in place, avoiding expensive drawing overlay invalidation.
   */
  updateCandle(row: CompactCandleRow): void {
    if (!this.candlestickSeries || !this.volumeSeries) return;
    const [timestamp, open, high, low, close, volume] = row;
    const time = timestamp as any;

    this.candlestickSeries.update({
      time,
      open,
      high,
      low,
      close,
    });

    const isUp = close >= open;
    this.volumeSeries.update({
      time,
      value: volume,
      color: isUp ? 'rgba(8, 153, 129, 0.5)' : 'rgba(242, 54, 69, 0.5)',
    });

    if (this.drawingEngine) {
      this.drawingEngine.setLatestPrice(close);
    }
  }

  /**
   * Smoothly pans the visible logical range when the replay index reaches or exceeds
   * the right visible margin (ADR 0001 - Domain 3).
   *
   * @param rightMargin Number of blank bars reserved on the right margin (default 8)
   * @param durationMs Duration of cubic eased pan tween (default 150ms)
   */
  triggerCameraFollow(rightMargin = 8, durationMs = 150): void {
    if (!this.chart || this.isUserInteracting || this.candleCount <= 0) return;
    const timeScale = this.chart.timeScale();
    const logicalRange = timeScale.getVisibleLogicalRange();
    if (!logicalRange) return;

    const lastBarIndex = this.candleCount - 1;
    const windowSize = logicalRange.to - logicalRange.from;
    if (isNaN(windowSize) || windowSize <= 2) return;

    // If user scrolled back into history (> 15 bars behind current edge), preserve their view
    if (logicalRange.to < lastBarIndex - 15) {
      return;
    }

    // Trigger smooth panning when bar enters or penetrates right margin
    if (lastBarIndex >= logicalRange.to - rightMargin) {
      const targetTo = lastBarIndex + rightMargin;
      const targetFrom = targetTo - windowSize;
      if (Number.isFinite(targetFrom) && Number.isFinite(targetTo)) {
        this.panToLogicalRange(targetFrom, targetTo, durationMs);
      }
    }
  }

  /**
   * Smoothly pans the chart's visible logical range using ease-out cubic interpolation.
   */
  panToLogicalRange(targetFrom: number, targetTo: number, durationMs = 150): void {
    if (!this.chart || this.isUserInteracting || typeof requestAnimationFrame !== 'function') return;
    const timeScale = this.chart.timeScale();
    const currentRange = timeScale.getVisibleLogicalRange();
    if (!currentRange) return;

    // Already at target within tolerance
    if (
      Math.abs(currentRange.from - targetFrom) < 0.1 &&
      Math.abs(currentRange.to - targetTo) < 0.1
    ) {
      return;
    }

    this.cancelCameraAnimation();

    const startFrom = currentRange.from;
    const startTo = currentRange.to;
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const step = (now: number) => {
      if (this.isUserInteracting || !this.chart) {
        this.cameraPanRafId = null;
        return;
      }

      const elapsed = Math.max(0, now - startTime);
      const progress = Math.min(1, elapsed / durationMs);
      // Ease-out cubic: 1 - (1 - progress)^3
      const ease = 1 - Math.pow(1 - progress, 3);

      const curFrom = startFrom + (targetFrom - startFrom) * ease;
      const curTo = startTo + (targetTo - startTo) * ease;

      try {
        timeScale.setVisibleLogicalRange({ from: curFrom, to: curTo });
      } catch {
        /* ignore */
      }

      if (progress < 1) {
        this.cameraPanRafId = requestAnimationFrame(step);
      } else {
        this.cameraPanRafId = null;
      }
    };

    this.cameraPanRafId = requestAnimationFrame(step);
  }

  /**
   * Immediately halts any active camera panning animation (e.g. on user drag, wheel, or jump).
   */
  cancelCameraAnimation(): void {
    if (this.cameraPanRafId !== null) {
      cancelAnimationFrame(this.cameraPanRafId);
      this.cameraPanRafId = null;
    }
  }

  /**
   * Toggles mouse-drag / touch panning on the chart.
   * Useful when drawing shapes or dragging objects/handles to prevent dual-motion chart panning.
   */
  setScrollEnabled(enabled: boolean): void {
    if (!this.chart) return;
    try {
      this.chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: enabled,
          horzTouchDrag: enabled,
          vertTouchDrag: enabled,
        },
      });
    } catch {
      // ignore
    }
  }

  /**
   * Add a line series for an indicator (overlay or sub-pane).
   */
  addIndicatorLineSeries(id: string, color: string, overlay: boolean, title: string): void {
    if (!this.chart) return;
    const existing = this.indicatorSeries.get(id);
    if (existing) {
      existing.applyOptions({ color, title });
      return;
    }

    const seriesOptions: any = {
      color,
      lineWidth: 2,
      title,
      priceLineVisible: false,
    };

    if (!overlay) {
      // Create separate bottom sub-pane scale margins
      seriesOptions.priceScaleId = `pane_${id}`;
    }

    const series = this.chart.addSeries(LineSeries, seriesOptions);

    if (!overlay) {
      series.priceScale().applyOptions({
        scaleMargins: {
          top: 0.7,
          bottom: 0.05,
        },
      });
    }

    this.indicatorSeries.set(id, series);
  }

  /**
   * Set data for an indicator line series.
   */
  setIndicatorLineData(id: string, data: { time: any; value: number }[]): void {
    const series = this.indicatorSeries.get(id);
    if (series) {
      series.setData(data as any);
    }
  }

  /**
   * Remove an indicator line series.
   */
  removeIndicatorSeries(id: string): void {
    const series = this.indicatorSeries.get(id);
    if (series && this.chart) {
      this.chart.removeSeries(series);
      this.indicatorSeries.delete(id);
    }
  }

  /**
   * Restores the chart viewport to default auto-scaled and right-fitted bounds.
   * Corresponds to TradingView "Reset chart view" (Alt + R) - ADR 0007.
   */
  resetChartView(): void {
    if (!this.chart) return;

    // 1. Cancel active smooth camera pan interpolations
    this.cancelCameraAnimation();

    // 2. Auto-scale primary price scale
    try {
      this.chart.priceScale('right').applyOptions({
        autoScale: true,
      });
    } catch {
      /* ignore */
    }

    // 3. Auto-scale any secondary indicator sub-pane price scales
    for (const series of this.indicatorSeries.values()) {
      try {
        series.priceScale().applyOptions({
          autoScale: true,
        });
      } catch {
        /* ignore */
      }
    }

    // 4. Reset time scale: fit historical content and return camera to current edge
    try {
      this.chart.timeScale().fitContent();
      this.chart.timeScale().resetTimeScale();
    } catch {
      /* ignore */
    }

    // 5. Invalidate and re-render vector drawing canvas overlay
    if (this.drawingEngine) {
      this.drawingEngine.redraw();
    }
  }

  /**
   * Toggles auto-scale on the right price scale.
   */
  setAutoScale(enabled: boolean): void {
    if (!this.chart) return;
    try {
      this.chart.priceScale('right').applyOptions({ autoScale: enabled });
    } catch {
      /* ignore */
    }
  }

  /**
   * Returns whether auto-scale is currently enabled on the right price scale.
   */
  isAutoScale(): boolean {
    if (!this.chart) return true;
    try {
      const opts = this.chart.priceScale('right').options();
      return opts.autoScale !== false;
    } catch {
      return true;
    }
  }

  /**
   * Toggles invert-scale on the right price scale.
   */
  setInvertScale(invert: boolean): void {
    if (!this.chart) return;
    try {
      this.chart.priceScale('right').applyOptions({ invertScale: invert });
      if (this.drawingEngine) {
        this.drawingEngine.redraw();
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Returns whether invert-scale is currently enabled on the right price scale.
   */
  isInvertScale(): boolean {
    if (!this.chart) return false;
    try {
      const opts = this.chart.priceScale('right').options();
      return opts.invertScale === true;
    } catch {
      return false;
    }
  }

  /**
   * Returns the exact pixel width of the right price scale.
   */
  getPriceScaleWidth(): number {
    try {
      if (this.chart) {
        const w = this.chart.priceScale('right')?.width?.() ?? 0;
        if (w > 0) return w;
      }
    } catch {
      /* ignore */
    }
    const stub = typeof this.container?.querySelector === 'function'
      ? this.container.querySelector('tr:first-child td:last-child')
      : null;
    return stub && (stub as HTMLElement).clientWidth > 0 ? (stub as HTMLElement).clientWidth : 65;
  }

  /**
   * Returns the exact pixel height of the horizontal time scale.
   */
  getTimeScaleHeight(): number {
    try {
      if (this.chart) {
        const h = this.chart.timeScale?.()?.height?.() ?? 0;
        if (h > 0) return h;
      }
    } catch {
      /* ignore */
    }
    const stub = typeof this.container?.querySelector === 'function'
      ? this.container.querySelector('tr:last-child td:first-child')
      : null;
    return stub && (stub as HTMLElement).clientHeight > 0 ? (stub as HTMLElement).clientHeight : 26;
  }

  /**
   * Clear chart data.
   */
  clear(): void {
    if (this.candlestickSeries) this.candlestickSeries.setData([]);
    if (this.volumeSeries) this.volumeSeries.setData([]);
    for (const series of this.indicatorSeries.values()) {
      series.setData([]);
    }
    if (this.drawingEngine) this.drawingEngine.redraw();
  }

  /**
   * Show loading/status overlay text over chart container.
   */
  showLoading(message = 'Loading data…'): void {
    if (!this.loadingEl) return;
    this.loadingEl.textContent = message;
    this.loadingEl.style.display = 'flex';
  }

  /**
   * Hide loading overlay text.
   */
  hideLoading(): void {
    if (!this.loadingEl) return;
    this.loadingEl.style.display = 'none';
  }

  /**
   * Scales the right price scale up or down based on wheel delta at a given Y coordinate.
   * Wheel up (deltaY < 0) zooms in (stretches vertically); wheel down (deltaY > 0) zooms out (compresses vertically).
   */
  zoomPriceScale(deltaY: number, clientY?: number): void {
    if (!this.chart || !this.candlestickSeries) return;
    const ps = this.chart.priceScale('right');
    const vr = ps.getVisibleRange();
    if (!vr) return;

    const totalSpan = vr.to - vr.from;
    if (totalSpan <= 0) return;

    let priceAtCursor: number;
    if (typeof clientY === 'number') {
      const table = typeof this.container.querySelector === 'function' ? this.container.querySelector('table') : null;
      const priceScaleTd = table ? table.querySelector('tr:first-child td:last-child') : null;
      const rect = priceScaleTd?.getBoundingClientRect();
      const paneY = rect ? clientY - rect.top : clientY - this.container.getBoundingClientRect().top;
      const p = this.candlestickSeries.coordinateToPrice(paneY);
      priceAtCursor = p !== null && !isNaN(p) ? p : (vr.from + vr.to) / 2;
    } else {
      priceAtCursor = (vr.from + vr.to) / 2;
    }

    // Zoom factor: smooth exponential scaling based on wheel delta
    const factor = Math.pow(1.0015, deltaY);
    const ratio = Math.max(0, Math.min(1, (priceAtCursor - vr.from) / totalSpan));
    const newSpan = Math.max(totalSpan * factor, 1e-7);
    const newFrom = priceAtCursor - ratio * newSpan;
    const newTo = priceAtCursor + (1 - ratio) * newSpan;

    ps.setVisibleRange({ from: newFrom, to: newTo });
    this.drawingEngine?.redraw();
  }

  /**
   * Clean up chart and listeners.
   */
  destroy(): void {
    this.cancelCameraAnimation();
    if (this.onUserPointerDown) {
      this.container.removeEventListener('pointerdown', this.onUserPointerDown);
    }
    if (this.onUserPointerUp) {
      window.removeEventListener('pointerup', this.onUserPointerUp);
    }
    if (this.onUserWheel) {
      this.container.removeEventListener('wheel', this.onUserWheel);
    }
    if (this.onPriceScaleWheel) {
      this.container.removeEventListener('wheel', this.onPriceScaleWheel, { capture: true });
    }
    if (this.onPriceScaleDblClick) {
      this.container.removeEventListener('dblclick', this.onPriceScaleDblClick);
    }

    if (this.resizeRafId !== null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.drawingEngine) {
      this.drawingEngine.destroy();
      this.drawingEngine = null;
    }
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
    }
  }
}