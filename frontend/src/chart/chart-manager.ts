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
import type { PositionDefinition } from '../trading/trading-types';

export function detectPricePrecision(samplePrice: number, symbol = ''): {
  precision: number;
  minMove: number;
  minimumWidth: number;
} {
  const sym = (symbol || '').toUpperCase();
  if (sym.includes('JPY')) {
    return { precision: 3, minMove: 0.001, minimumWidth: 80 };
  }
  if (samplePrice <= 0 || isNaN(samplePrice)) {
    return { precision: 5, minMove: 0.00001, minimumWidth: 85 };
  }
  if (samplePrice < 0.001) {
    return { precision: 7, minMove: 0.0000001, minimumWidth: 95 };
  }
  if (samplePrice < 0.1) {
    return { precision: 6, minMove: 0.000001, minimumWidth: 90 };
  }
  if (samplePrice < 10) {
    return { precision: 5, minMove: 0.00001, minimumWidth: 85 };
  }
  if (samplePrice < 100) {
    return { precision: 3, minMove: 0.001, minimumWidth: 80 };
  }
  if (samplePrice < 10000) {
    return { precision: 2, minMove: 0.01, minimumWidth: 85 };
  }
  return { precision: 2, minMove: 0.01, minimumWidth: 90 };
}

export class ChartManager {
  private chart: IChartApi | null = null;
  private candlestickSeries: ISeriesApi<'Candlestick'> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private indicatorSeries = new Map<string, ISeriesApi<'Line'>>();
  private drawingEngine: DrawingEngine | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private loadingEl: HTMLElement | null = null;
  private currentSymbol = '';

  constructor(
    private readonly container: HTMLElement,
    private readonly onDrawingSave?: (d: DrawingDefinition) => void,
    private readonly onDrawingDelete?: (id: string) => void,
    private readonly onDrawingSelect?: (d: DrawingDefinition | null) => void,
    private readonly onToolChange?: (tool: string) => void,
    private readonly onClosePosition?: (positionId: string, currentPrice: number) => void,
  ) {}

  getDrawingEngine(): DrawingEngine | null {
    return this.drawingEngine;
  }

  setPositions(positions: PositionDefinition[]): void {
    if (this.drawingEngine) {
      this.drawingEngine.setPositions(positions);
    }
  }

  setLatestPrice(price: number): void {
    if (this.drawingEngine) {
      this.drawingEngine.setLatestPrice(price);
    }
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
        minimumWidth: 85,
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
    );

    // Setup responsive ResizeObserver
    this.resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length || !this.chart) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        this.chart.applyOptions({ width, height });
        if (this.drawingEngine) {
          this.drawingEngine.resize();
        }
      }
    });

    this.resizeObserver.observe(this.container);
  }

  resize(width: number, height: number): void {
    if (this.chart && width > 0 && height > 0) {
      this.chart.applyOptions({ width, height });
      if (this.drawingEngine) {
        this.drawingEngine.resize();
      }
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
    this.chart.applyOptions({
      rightPriceScale: {
        minimumWidth: fmt.minimumWidth,
      },
    });

    const { candles, volumes } = parseCompactHistory(rows);
    this.candlestickSeries.setData(candles);
    this.volumeSeries.setData(volumes);

    this.chart.timeScale().fitContent();

    if (this.drawingEngine) {
      this.drawingEngine.setCandleData(rows);
      if (rows.length > 0) {
        this.drawingEngine.setLatestPrice(rows[rows.length - 1][4]);
      }
      this.drawingEngine.redraw();
    }
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
      this.drawingEngine.redraw();
    }
  }

  /**
   * Add a line series for an indicator (overlay or sub-pane).
   */
  addIndicatorLineSeries(id: string, color: string, overlay: boolean, title: string): void {
    if (!this.chart) return;
    if (this.indicatorSeries.has(id)) {
      this.removeIndicatorSeries(id);
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
   * Clean up chart and listeners.
   */
  destroy(): void {
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