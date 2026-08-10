import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

export interface Point2D {
  x: number;
  y: number;
}

export interface MarketCoordinate {
  time: number | null;
  price: number | null;
}

/**
 * Coordinate Conversion Canvas Overlay (Wave 2.5 Spike).
 * De-risks Wave 5/6 custom drawing engine by establishing bidirectional
 * pixel <-> (timestamp, price) mapping synchronized with Lightweight Charts.
 */
export class DrawingSpikeCanvas {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private activePoint: MarketCoordinate | null = null;
  private isEnabled = true;

  constructor(
    private readonly container: HTMLElement,
    private readonly chart: IChartApi,
    private readonly series: ISeriesApi<'Candlestick'>,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'drawing-spike-canvas';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '10';

    this.container.style.position = 'relative';
    this.container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for drawing canvas');
    this.ctx = ctx;

    this.resize();
    this.subscribeEvents();
  }

  /**
   * Sync canvas element dimensions with parent container size.
   */
  resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);
    this.redraw();
  }

  /**
   * Convert container relative pixel (x, y) to (timestamp, price).
   */
  pixelToPoint(x: number, y: number): MarketCoordinate {
    const timeScale = this.chart.timeScale();
    const time = timeScale.coordinateToTime(x) as number | null;
    const price = this.series.coordinateToPrice(y);
    return { time, price };
  }

  /**
   * Convert market coordinate (timestamp, price) to container pixel (x, y).
   */
  pointToPixel(time: number, price: number): Point2D | null {
    const timeScale = this.chart.timeScale();
    const x = timeScale.timeToCoordinate(time as UTCTimestamp);
    const y = this.series.priceToCoordinate(price);

    if (x === null || y === null) return null;
    return { x, y };
  }

  /**
   * Set active cursor position for preview rendering.
   */
  setActiveCursor(pixel: Point2D | null): void {
    if (pixel) {
      this.activePoint = this.pixelToPoint(pixel.x, pixel.y);
    } else {
      this.activePoint = null;
    }
    this.redraw();
  }

  /**
   * Re-draw coordinate spike overlay elements.
   */
  redraw(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.ctx.clearRect(0, 0, width, height);

    if (!this.isEnabled) return;

    // If active point is defined, verify bidirectional round-trip math
    if (this.activePoint && this.activePoint.time !== null && this.activePoint.price !== null) {
      const converted = this.pointToPixel(this.activePoint.time, this.activePoint.price);
      if (converted) {
        this.renderSpikeMarker(converted.x, converted.y, this.activePoint);
      }
    }
  }

  private renderSpikeMarker(x: number, y: number, point: MarketCoordinate): void {
    // Draw target reticle / marker circle
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(x, y, 6, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#2962ff';
    this.ctx.lineWidth = 2;
    this.ctx.fillStyle = 'rgba(41, 98, 255, 0.2)';
    this.ctx.fill();
    this.ctx.stroke();

    // Draw coordinate readout box
    if (point.time !== null && point.price !== null) {
      const text = `${new Date(point.time * 1000).toISOString().substring(11, 16)} | $${point.price.toFixed(2)}`;
      this.ctx.font = '11px sans-serif';
      const textWidth = this.ctx.measureText(text).width;
      const boxWidth = textWidth + 12;
      const boxHeight = 20;

      const boxX = Math.min(Math.max(x + 10, 5), this.container.clientWidth - boxWidth - 5);
      const boxY = Math.max(y - 25, 5);

      this.ctx.fillStyle = 'rgba(19, 23, 34, 0.85)';
      this.ctx.strokeStyle = '#2962ff';
      this.ctx.lineWidth = 1;
      this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

      this.ctx.fillStyle = '#d1d4dc';
      this.ctx.fillText(text, boxX + 6, boxY + 14);
    }

    this.ctx.restore();
  }

  private subscribeEvents(): void {
    // Re-draw overlay whenever visible range or scroll/zoom changes
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      this.redraw();
    });

    // Listen to crosshair move for interactive coordinate updating
    this.chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.point.x < 0 || param.point.y < 0) {
        this.setActiveCursor(null);
      } else {
        this.setActiveCursor({ x: param.point.x, y: param.point.y });
      }
    });
  }

  destroy(): void {
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
