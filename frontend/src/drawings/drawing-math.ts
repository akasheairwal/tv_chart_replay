import type { CompactCandleRow } from '../chart/candle-series';
import type {
  DrawingPoint,
  DrawingStyle,
  DrawingType,
  HandleRole,
  HandleCursor,
} from './drawing-types';

export function distanceToPoint(px: number, py: number, x: number, y: number): number {
  const dx = px - x;
  const dy = py - y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function constrainPointAngle(
  current: { x: number; y: number },
  anchor: { x: number; y: number },
): { x: number; y: number } {
  const dx = current.x - anchor.x;
  const dy = current.y - anchor.y;
  if (dx === 0 && dy === 0) return { ...current };

  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4; // 45 degree angle steps
  const snappedAngle = Math.round(angle / step) * step;

  // Horizontal snap (0, PI, -PI)
  if (Math.abs(Math.sin(snappedAngle)) < 0.01) {
    return { x: current.x, y: anchor.y };
  }
  // Vertical snap (PI/2, -PI/2)
  if (Math.abs(Math.cos(snappedAngle)) < 0.01) {
    return { x: anchor.x, y: current.y };
  }
  // 45 degree diagonal snap
  const dist = Math.hypot(dx, dy);
  return {
    x: anchor.x + dist * Math.cos(snappedAngle),
    y: anchor.y + dist * Math.sin(snappedAngle),
  };
}

export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return distanceToPoint(px, py, x1, y1);

  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return distanceToPoint(px, py, projX, projY);
}

export function distanceToRay(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return distanceToPoint(px, py, x1, y1);

  const t = ((px - x1) * dx + (py - y1) * dy) / l2;
  if (t < 0) return distanceToPoint(px, py, x1, y1);

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return distanceToPoint(px, py, projX, projY);
}

export function distanceToInfiniteLine(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return distanceToPoint(px, py, x1, y1);

  return Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len;
}

export function isPointInRect(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tolerance = 6,
): boolean {
  const minX = Math.min(x1, x2) - tolerance;
  const maxX = Math.max(x1, x2) + tolerance;
  const minY = Math.min(y1, y2) - tolerance;
  const maxY = Math.max(y1, y2) + tolerance;

  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

export function isPointInEllipse(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tolerance = 6,
): boolean {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2 + tolerance;
  const ry = Math.abs(y2 - y1) / 2 + tolerance;

  if (rx === 0 || ry === 0) return false;

  const normX = (px - cx) / rx;
  const normY = (py - cy) / ry;
  return normX * normX + normY * normY <= 1.0;
}

export function isPointInPolygon(
  px: number,
  py: number,
  polygon: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// -- Fibonacci Calculations -------------------------------------------

export const DEFAULT_FIB_RETRACEMENT_LEVELS = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
export const DEFAULT_FIB_EXTENSION_LEVELS = [0.0, 0.382, 0.5, 0.618, 1.0, 1.272, 1.618, 2.618];
export const FIB_TIMEZONE_FACTORS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
export const GANN_FAN_RATIOS = [
  { label: '1/8', ratio: 1 / 8 },
  { label: '1/4', ratio: 1 / 4 },
  { label: '1/3', ratio: 1 / 3 },
  { label: '1/2', ratio: 1 / 2 },
  { label: '1/1', ratio: 1 },
  { label: '2/1', ratio: 2 },
  { label: '3/1', ratio: 3 },
  { label: '4/1', ratio: 4 },
  { label: '8/1', ratio: 8 },
];
export const GANN_BOX_LEVELS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1.0];

export function calculateFibRetracementPrice(
  p1: number,
  p2: number,
  ratio: number,
): number {
  return p1 + (p2 - p1) * ratio;
}

export function calculateFibExtensionPrice(
  pA: number,
  pB: number,
  pC: number,
  ratio: number,
): number {
  return pC + (pB - pA) * ratio;
}

// -- Channel Math ----------------------------------------------------

export interface ParallelChannelGeometry {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
  p4: { x: number; y: number };
  medianStart: { x: number; y: number };
  medianEnd: { x: number; y: number };
}

export function calculateParallelChannel(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
): ParallelChannelGeometry {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const l2 = dx * dx + dy * dy;

  let offsetX = 0;
  let offsetY = 0;

  if (l2 > 0) {
    const t = ((p3.x - p1.x) * dx + (p3.y - p1.y) * dy) / l2;
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    offsetX = p3.x - projX;
    offsetY = p3.y - projY;
  } else {
    offsetX = p3.x - p1.x;
    offsetY = p3.y - p1.y;
  }

  const p4 = { x: p2.x + offsetX, y: p2.y + offsetY };
  const p3Aligned = { x: p1.x + offsetX, y: p1.y + offsetY };

  const medianStart = { x: (p1.x + p3Aligned.x) / 2, y: (p1.y + p3Aligned.y) / 2 };
  const medianEnd = { x: (p2.x + p4.x) / 2, y: (p2.y + p4.y) / 2 };

  return {
    p1,
    p2,
    p3: p3Aligned,
    p4,
    medianStart,
    medianEnd,
  };
}

// -- Pitchfork Math --------------------------------------------------

export interface PitchforkGeometry {
  origin: { x: number; y: number };
  midpoint: { x: number; y: number };
  medianEnd: { x: number; y: number };
  upperEnd: { x: number; y: number };
  lowerEnd: { x: number; y: number };
}

export function calculatePitchfork(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  variant: 'standard' | 'schiff' | 'modified_schiff' | 'inside' | boolean = 'standard',
  extent = 2000,
): PitchforkGeometry {
  let origin = { x: p1.x, y: p1.y };
  if (variant === true || variant === 'schiff') {
    origin = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  } else if (variant === 'modified_schiff') {
    origin = { x: p1.x, y: (p1.y + p2.y) / 2 };
  } else if (variant === 'inside') {
    origin = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  const midpoint =
    variant === 'inside'
      ? { x: p3.x, y: p3.y }
      : { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  const dx = midpoint.x - origin.x;
  const dy = midpoint.y - origin.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  const unitX = len > 0 ? dx / len : 1;
  const unitY = len > 0 ? dy / len : 0;

  const medianEnd = {
    x: midpoint.x + unitX * extent,
    y: midpoint.y + unitY * extent,
  };

  const upperEnd = {
    x: p2.x + unitX * extent,
    y: p2.y + unitY * extent,
  };

  const lowerEnd = {
    x: p3.x + unitX * extent,
    y: p3.y + unitY * extent,
  };

  return {
    origin,
    midpoint,
    medianEnd,
    upperEnd,
    lowerEnd,
  };
}

// -- Formatting & Measurement helpers --------------------------------

export function getPipSize(price: number): number {
  if (price > 1000) return 1.0; // Crypto / Indices (BTC, SPX, etc.)
  if (price > 50) return 0.01; // JPY pairs, Gold, Oil
  return 0.0001; // Standard FX pairs (EURUSD, GBPUSD, etc.)
}

export function formatPriceChange(
  delta: number,
  basePrice: number,
  precision = 4,
): {
  text: string;
  pctText: string;
  pipsText: string;
  ticksText: string;
  isPositive: boolean;
  pips: number;
} {
  const pct = basePrice !== 0 ? (delta / basePrice) * 100 : 0;
  const isPositive = delta >= 0;
  const sign = isPositive ? '+' : '';
  const text = `${sign}${delta.toFixed(precision)}`;
  const pctText = `(${sign}${pct.toFixed(2)}%)`;

  const pipSize = getPipSize(basePrice);
  const pips = delta / pipSize;
  const pipsText = `${sign}${pips.toFixed(1)} pips`;
  const ticksText = `${sign}${Math.round(pips * 10)} ticks`;

  return { text, pctText, pipsText, ticksText, isPositive, pips };
}

export function formatDuration(seconds: number): string {
  const absSec = Math.abs(seconds);
  const days = Math.floor(absSec / 86400);
  const hours = Math.floor((absSec % 86400) / 3600);
  const mins = Math.floor((absSec % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatVolume(volume: number): string {
  if (!volume || isNaN(volume)) return '';
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return `${Math.round(volume)}`;
}

export function formatCrosshairPrice(price: number, symbol = ''): string {
  if (price === undefined || price === null || isNaN(price)) return '';
  const sym = (symbol || '').toUpperCase();
  const isJpy = sym.includes('JPY');
  const isCrypto = sym.includes('BTC') || sym.includes('ETH') || sym.includes('SOL') || price > 1000;
  const isGoldOrIndex = sym.includes('XAU') || sym.includes('US30') || sym.includes('SPX') || sym.includes('NAS') || sym.includes('OIL');

  if (isCrypto || isGoldOrIndex || price >= 500) {
    return price.toFixed(2);
  }
  if (isJpy || (price >= 50 && price < 500)) {
    return price.toFixed(3);
  }
  return price.toFixed(5);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatCrosshairTime(timestamp: number, timeframe = '1H'): string {
  if (!timestamp || isNaN(timestamp)) return '';
  const tsMs = timestamp > 1e11 ? timestamp : timestamp * 1000;
  const d = new Date(tsMs);
  if (isNaN(d.getTime())) return '';

  const day = d.getUTCDate();
  const mon = MONTHS[d.getUTCMonth()];
  const yr = String(d.getUTCFullYear()).slice(-2);
  const hrs = String(d.getUTCHours()).padStart(2, '0');
  const mins = String(d.getUTCMinutes()).padStart(2, '0');

  const tfUpper = (timeframe || '').toUpperCase();
  if (tfUpper.includes('D') || tfUpper.includes('W') || tfUpper.includes('MONTH')) {
    return `${day} ${mon} '${yr}`;
  }
  return `${day} ${mon} '${yr}  ${hrs}:${mins}`;
}

export type {
  PositionMetrics,
  DetailedPositionMetrics,
  PositionRiskMode,
  SymbolSpec,
  PositionCalculationInput,
  RangeMetrics,
  ForecastStatus,
  ForecastEvaluationResult,
} from './position-calculator';

export {
  detectSymbolSpec,
  calculateFinancialPosition,
  calculatePositionMetricsFromStyle,
  solveTargetForRiskReward,
  solveStopForRiskReward,
  solveLotSizeForRisk,
  calculateRangeMetrics,
  evaluateForecastOutcome,
} from './position-calculator';

import type { PositionMetrics } from './position-calculator';
import { calculatePositionMetricsFromStyle } from './position-calculator';

export function calculatePositionMetrics(
  type: 'long_position' | 'short_position',
  points: { timestamp: number; price: number }[],
  style: import('./drawing-types').DrawingStyle,
  fallbackAccountBalance = 10000,
): PositionMetrics {
  return calculatePositionMetricsFromStyle(type, points, style, fallbackAccountBalance);
}

export function smoothFreehandPoints(
  pts: { x: number; y: number }[],
  passes = 2,
): { x: number; y: number }[] {
  if (pts.length <= 2) return pts;
  let current = pts;
  for (let pass = 0; pass < passes; pass++) {
    const next: { x: number; y: number }[] = [current[0]];
    for (let i = 1; i < current.length - 1; i++) {
      const prev = current[i - 1];
      const curr = current[i];
      const nxt = current[i + 1];
      // 1:2:1 Gaussian low-pass filter
      next.push({
        x: 0.25 * prev.x + 0.5 * curr.x + 0.25 * nxt.x,
        y: 0.25 * prev.y + 0.5 * curr.y + 0.25 * nxt.y,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

export function drawCatmullRomSpline(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  tension = 0.5,
): void {
  if (pts.length < 2) return;
  if (pts.length === 2) {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }

  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

/**
 * Mid-point Quadratic Bézier Spline Interpolation (ADR 0001 - Domain 4C)
 *
 * Smooths freehand pencil and brush strokes by drawing quadratic curves between
 * consecutive segment mid-points, using stroke points as control vertices.
 * Guarantees C1 continuity without the loops or overshoots common to high-tension splines.
 */
export function drawMidpointQuadraticSpline(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
): void {
  if (pts.length < 2) return;
  if (pts.length === 2) {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }

  ctx.moveTo(pts[0].x, pts[0].y);

  // Initial segment to the first mid-point
  const mid0x = (pts[0].x + pts[1].x) / 2;
  const mid0y = (pts[0].y + pts[1].y) / 2;
  ctx.lineTo(mid0x, mid0y);

  // Intermediate mid-point quadratic curves
  for (let i = 1; i < pts.length - 1; i++) {
    const nextMidX = (pts[i].x + pts[i + 1].x) / 2;
    const nextMidY = (pts[i].y + pts[i + 1].y) / 2;
    if (typeof ctx.quadraticCurveTo === 'function') {
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, nextMidX, nextMidY);
    } else {
      ctx.lineTo(nextMidX, nextMidY);
    }
  }

  // Final segment to the last point
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

export interface PositionHandleCoords {
  leftX: number;
  rightX: number;
  midX: number;
  tpY: number;
  slY: number;
}

export function calculatePositionHandleCoords(
  p1: { x: number; y: number },
  metrics: PositionMetrics,
  chartToPixel: (pt: { timestamp: number; price: number }) => { x: number; y: number } | null,
  t0: number,
): PositionHandleCoords {
  const tpPixel = chartToPixel({ timestamp: t0, price: metrics.tpPrice });
  const slPixel = chartToPixel({ timestamp: t0, price: metrics.slPrice });
  const endPixel = chartToPixel({ timestamp: metrics.endTimestamp, price: metrics.entryPrice });

  const leftX = p1.x;
  const rightX = Math.max(leftX + 5, endPixel?.x ?? (leftX + 30));
  const midX = (leftX + rightX) / 2;

  const tpY = tpPixel?.y ?? (metrics.isLong ? p1.y - 60 : p1.y + 60);
  const slY = slPixel?.y ?? (metrics.isLong ? p1.y + 30 : p1.y - 30);

  return { leftX, rightX, midX, tpY, slY };
}




export function constrainSquare(
  current: { x: number; y: number },
  anchor: { x: number; y: number },
): { x: number; y: number } {
  const dx = current.x - anchor.x;
  const dy = current.y - anchor.y;
  if (dx === 0 && dy === 0) return { ...current };

  const size = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = dx >= 0 ? 1 : -1;
  const sy = dy >= 0 ? 1 : -1;

  return {
    x: anchor.x + sx * size,
    y: anchor.y + sy * size,
  };
}

export function constrainCircle(
  current: { x: number; y: number },
  anchor: { x: number; y: number },
): { x: number; y: number } {
  return constrainSquare(current, anchor);
}

export interface CandleSnapResult {
  snapped: boolean;
  point: DrawingPoint;
  pixelPoint?: { x: number; y: number };
  level?: 'open' | 'high' | 'low' | 'close';
  candle?: CompactCandleRow;
  distancePx?: number;
}

/**
 * Binary search to locate the index of the candle with the closest timestamp.
 */
export function findNearestCandleIndex(
  timestamp: number,
  candles: CompactCandleRow[],
): number {
  if (!candles || candles.length === 0) return -1;
  let low = 0;
  let high = candles.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (candles[mid][0] === timestamp) {
      return mid;
    } else if (candles[mid][0] < timestamp) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const prevIdx = Math.max(0, low - 1);
  const nextIdx = Math.min(candles.length - 1, low);
  const diffPrev = Math.abs(candles[prevIdx][0] - timestamp);
  const diffNext = Math.abs(candles[nextIdx][0] - timestamp);
  return diffPrev <= diffNext ? prevIdx : nextIdx;
}

/**
 * Spatial Candle Magnet Snapping Algorithm (ADR 0004 - Phase 3).
 *
 * Implements Weak Magnet (screenspace Euclidean proximity <= 15px within 25px horizontal window)
 * and Strong Magnet (unconditional nearest candle column snap to closest OHLC level).
 */
export function snapToCandleOHLC(
  screenPos: { x: number; y: number },
  candles: CompactCandleRow[],
  mode: 'weak' | 'strong',
  chartToPixel: (pt: DrawingPoint) => { x: number; y: number } | null,
  pixelToChart: (x: number, y: number) => DrawingPoint | null,
  options?: {
    weakProximityX?: number;
    weakSnapDistance?: number;
  },
): CandleSnapResult {
  const chartPt = pixelToChart(screenPos.x, screenPos.y);
  if (!chartPt || !candles || candles.length === 0) {
    return {
      snapped: false,
      point: chartPt || { timestamp: 0, price: 0 },
      pixelPoint: screenPos,
    };
  }

  const centerIdx = findNearestCandleIndex(chartPt.timestamp, candles);
  if (centerIdx < 0) {
    return { snapped: false, point: chartPt, pixelPoint: screenPos };
  }

  const startIdx = Math.max(0, centerIdx - 15);
  const endIdx = Math.min(candles.length - 1, centerIdx + 15);

  const weakProximityX = options?.weakProximityX ?? 25;
  const weakSnapDistance = options?.weakSnapDistance ?? 15;

  if (mode === 'strong') {
    let bestCandle = candles[centerIdx];
    let minDx = Infinity;

    for (let i = startIdx; i <= endIdx; i++) {
      const c = candles[i];
      const candlePix = chartToPixel({ timestamp: c[0], price: c[1] });
      if (!candlePix) continue;
      const dx = Math.abs(screenPos.x - candlePix.x);
      if (dx < minDx) {
        minDx = dx;
        bestCandle = c;
      }
    }

    const [, o, h, l, c] = bestCandle;
    const levels: { level: 'open' | 'high' | 'low' | 'close'; price: number }[] = [
      { level: 'open', price: o },
      { level: 'high', price: h },
      { level: 'low', price: l },
      { level: 'close', price: c },
    ];

    let bestLevel = levels[0];
    let minDy = Infinity;

    for (const lvl of levels) {
      const lvlPix = chartToPixel({ timestamp: bestCandle[0], price: lvl.price });
      const dy = lvlPix ? Math.abs(screenPos.y - lvlPix.y) : Math.abs(chartPt.price - lvl.price);
      if (dy < minDy) {
        minDy = dy;
        bestLevel = lvl;
      }
    }

    const snappedPoint: DrawingPoint = {
      timestamp: bestCandle[0],
      price: bestLevel.price,
    };
    const pixelPoint = chartToPixel(snappedPoint) || screenPos;

    return {
      snapped: true,
      point: snappedPoint,
      pixelPoint,
      level: bestLevel.level,
      candle: bestCandle,
      distancePx: Math.hypot(minDx, minDy),
    };
  }

  // Weak Magnet
  let bestCandidate: {
    candle: CompactCandleRow;
    level: 'open' | 'high' | 'low' | 'close';
    price: number;
    pixelPoint: { x: number; y: number };
    distance: number;
  } | null = null;
  let minDistance = Infinity;

  for (let i = startIdx; i <= endIdx; i++) {
    const c = candles[i];
    const candlePix = chartToPixel({ timestamp: c[0], price: c[1] });
    if (!candlePix) continue;

    const dx = Math.abs(screenPos.x - candlePix.x);
    if (dx > weakProximityX) continue;

    const [, o, h, l, close] = c;
    const levels: { level: 'open' | 'high' | 'low' | 'close'; price: number }[] = [
      { level: 'open', price: o },
      { level: 'high', price: h },
      { level: 'low', price: l },
      { level: 'close', price: close },
    ];

    for (const lvl of levels) {
      const lvlPix = chartToPixel({ timestamp: c[0], price: lvl.price });
      if (!lvlPix) continue;

      const dist = Math.hypot(screenPos.x - lvlPix.x, screenPos.y - lvlPix.y);
      if (dist < minDistance) {
        minDistance = dist;
        bestCandidate = {
          candle: c,
          level: lvl.level,
          price: lvl.price,
          pixelPoint: lvlPix,
          distance: dist,
        };
      }
    }
  }

  if (bestCandidate && minDistance <= weakSnapDistance) {
    return {
      snapped: true,
      point: { timestamp: bestCandidate.candle[0], price: bestCandidate.price },
      pixelPoint: bestCandidate.pixelPoint,
      level: bestCandidate.level,
      candle: bestCandidate.candle,
      distancePx: minDistance,
    };
  }

  return {
    snapped: false,
    point: chartPt,
    pixelPoint: screenPos,
    distancePx: minDistance,
  };
}

export function findNearestCandleOHLC(
  target: { timestamp: number; price: number },
  candles: CompactCandleRow[],
): { timestamp: number; price: number } | null {
  if (!candles || candles.length === 0) return null;
  const idx = findNearestCandleIndex(target.timestamp, candles);
  if (idx < 0) return null;

  const bestCandle = candles[idx];
  const [, open, highPrice, lowPrice, close] = bestCandle;
  const ohlc = [open, highPrice, lowPrice, close];

  let nearestPrice = ohlc[0];
  let minPriceDiff = Math.abs(ohlc[0] - target.price);

  for (let i = 1; i < ohlc.length; i++) {
    const diff = Math.abs(ohlc[i] - target.price);
    if (diff < minPriceDiff) {
      minPriceDiff = diff;
      nearestPrice = ohlc[i];
    }
  }

  return {
    timestamp: bestCandle[0],
    price: nearestPrice,
  };
}

// ---------------------------------------------------------------------------
// ADR 0004 - Phase 2: Topological Constraint Engine
// ---------------------------------------------------------------------------

/**
 * Geometric structure of a Parallel Channel in logical time/price coordinates.
 */
export interface LogicalParallelChannelGeometry {
  p1: DrawingPoint; // Baseline start
  p2: DrawingPoint; // Baseline end
  p3: DrawingPoint; // Offset start
  p4: DrawingPoint; // Offset end
  medianStart: DrawingPoint;
  medianEnd: DrawingPoint;
}

/**
 * Calculates all 4 corners and median line of a parallel channel in logical coordinates.
 */
export function calculateLogicalParallelChannel(
  p1: DrawingPoint,
  p2: DrawingPoint,
  p3: DrawingPoint,
): LogicalParallelChannelGeometry {
  const dt = p3.timestamp - p1.timestamp;
  const dp = p3.price - p1.price;
  const p4: DrawingPoint = {
    timestamp: p2.timestamp + dt,
    price: p2.price + dp,
  };
  const medianStart: DrawingPoint = {
    timestamp: (p1.timestamp + p3.timestamp) / 2,
    price: (p1.price + p3.price) / 2,
  };
  const medianEnd: DrawingPoint = {
    timestamp: (p2.timestamp + p4.timestamp) / 2,
    price: (p2.price + p4.price) / 2,
  };
  return { p1, p2, p3, p4, medianStart, medianEnd };
}

/**
 * Solves topological constraints for Parallel Channel handle dragging.
 * Preserves channel width and baseline parallelism.
 */
export function solveParallelChannelConstraint(
  handleIndex: number,
  draggedPoint: DrawingPoint,
  currentPoints: DrawingPoint[],
): DrawingPoint[] {
  if (currentPoints.length < 3) {
    const pts = [...currentPoints];
    if (handleIndex >= 0 && handleIndex < pts.length) {
      pts[handleIndex] = { ...draggedPoint };
    }
    return pts;
  }

  const p1 = currentPoints[0];
  const p2 = currentPoints[1];
  const p3 = currentPoints[2];

  if (handleIndex === 2) {
    // Dragging channel width/offset handle: modifies only p3
    return [p1, p2, { ...draggedPoint }];
  }

  if (handleIndex === 0) {
    // Dragging baseline start p1: translates p3 along with baseline displacement to preserve offset
    const dt = draggedPoint.timestamp - p1.timestamp;
    const dp = draggedPoint.price - p1.price;
    const newP3: DrawingPoint = {
      timestamp: p3.timestamp + dt,
      price: p3.price + dp,
    };
    return [{ ...draggedPoint }, p2, newP3];
  }

  if (handleIndex === 1) {
    // Dragging baseline end p2: translates p3 along with baseline displacement
    const dt = draggedPoint.timestamp - p2.timestamp;
    const dp = draggedPoint.price - p2.price;
    const newP3: DrawingPoint = {
      timestamp: p3.timestamp + dt,
      price: p3.price + dp,
    };
    return [p1, { ...draggedPoint }, newP3];
  }

  // Handle translation of all points (e.g. midpoint handle)
  const dt = draggedPoint.timestamp - p1.timestamp;
  const dp = draggedPoint.price - p1.price;
  return currentPoints.map((pt) => ({
    timestamp: pt.timestamp + dt,
    price: pt.price + dp,
  }));
}

/**
 * Pitchfork geometry calculated in logical time/price space.
 */
export interface LogicalPitchforkGeometry {
  origin: DrawingPoint;
  midpoint: DrawingPoint;
  medianVector: { dt: number; dp: number };
}

/**
 * Computes logical pitchfork origin, midpoint, and directional vector
 * supporting Standard (Andrews), Schiff, Modified Schiff, and Inside Pitchfork variants.
 */
export function calculateLogicalPitchfork(
  p1: DrawingPoint,
  p2: DrawingPoint,
  p3: DrawingPoint,
  variant: 'standard' | 'schiff' | 'modified_schiff' | 'inside' = 'standard',
): LogicalPitchforkGeometry {
  let origin: DrawingPoint = { ...p1 };

  if (variant === 'schiff') {
    // Origin shifted halfway in price between P1 and P2
    origin = {
      timestamp: p1.timestamp,
      price: p1.price + (p2.price - p1.price) / 2,
    };
  } else if (variant === 'modified_schiff') {
    // Origin shifted halfway in time between P1 and P2
    origin = {
      timestamp: p1.timestamp + (p2.timestamp - p1.timestamp) / 2,
      price: p1.price,
    };
  } else if (variant === 'inside') {
    // Origin at midpoint of P1 and P2
    origin = {
      timestamp: (p1.timestamp + p2.timestamp) / 2,
      price: (p1.price + p2.price) / 2,
    };
  }

  const midpoint: DrawingPoint =
    variant === 'inside'
      ? { ...p3 }
      : {
          timestamp: (p2.timestamp + p3.timestamp) / 2,
          price: (p2.price + p3.price) / 2,
        };

  return {
    origin,
    midpoint,
    medianVector: {
      dt: midpoint.timestamp - origin.timestamp,
      dp: midpoint.price - origin.price,
    },
  };
}

/**
 * Solves topological constraints for Pitchfork handle dragging.
 */
export function solvePitchforkConstraint(
  handleIndex: number,
  draggedPoint: DrawingPoint,
  currentPoints: DrawingPoint[],
  _variant: 'standard' | 'schiff' | 'modified_schiff' | 'inside' = 'standard',
): DrawingPoint[] {
  const pts = [...currentPoints];
  if (handleIndex >= 0 && handleIndex < pts.length) {
    pts[handleIndex] = { ...draggedPoint };
  }
  return pts;
}

/**
 * 8 interactive handles for Rectangle geometry (4 corners + 4 edge midpoints).
 */
export interface RectangleHandleInfo {
  index: number;
  role: HandleRole;
  cursor: HandleCursor;
  label: string;
  point: DrawingPoint;
}

/**
 * Resolves all 8 interactive handles for a rectangle from its 2 bounding corners.
 */
export function getRectangle8Handles(points: DrawingPoint[]): RectangleHandleInfo[] {
  if (points.length < 2) return [];
  const p1 = points[0];
  const p2 = points[1];

  const minT = Math.min(p1.timestamp, p2.timestamp);
  const maxT = Math.max(p1.timestamp, p2.timestamp);
  const minP = Math.min(p1.price, p2.price);
  const maxP = Math.max(p1.price, p2.price);
  const midT = (minT + maxT) / 2;
  const midP = (minP + maxP) / 2;

  return [
    // 4 Corner Handles (2D resizing)
    { index: 0, role: 'vertex', cursor: 'nwse-resize', label: 'Top-Left', point: { timestamp: minT, price: maxP } },
    { index: 1, role: 'vertex', cursor: 'nesw-resize', label: 'Top-Right', point: { timestamp: maxT, price: maxP } },
    { index: 2, role: 'vertex', cursor: 'nwse-resize', label: 'Bottom-Right', point: { timestamp: maxT, price: minP } },
    { index: 3, role: 'vertex', cursor: 'nesw-resize', label: 'Bottom-Left', point: { timestamp: minT, price: minP } },
    // 4 Edge Midpoint Handles (1D axial resizing)
    { index: 4, role: 'midpoint', cursor: 'ns-resize', label: 'Top Edge', point: { timestamp: midT, price: maxP } },
    { index: 5, role: 'midpoint', cursor: 'ew-resize', label: 'Right Edge', point: { timestamp: maxT, price: midP } },
    { index: 6, role: 'midpoint', cursor: 'ns-resize', label: 'Bottom Edge', point: { timestamp: midT, price: minP } },
    { index: 7, role: 'midpoint', cursor: 'ew-resize', label: 'Left Edge', point: { timestamp: minT, price: midP } },
  ];
}

/**
 * Solves topological constraints for Rectangle handle dragging.
 * Handles 0..3 resize both dimensions; Handles 4 & 6 resize ONLY price; Handles 5 & 7 resize ONLY time.
 */
export function solveRectangleHandleDrag(
  handleIndex: number,
  draggedPoint: DrawingPoint,
  currentPoints: DrawingPoint[],
  _isShiftPressed = false,
): DrawingPoint[] {
  if (currentPoints.length < 2) return currentPoints;
  const p1 = currentPoints[0];
  const p2 = currentPoints[1];

  let minT = Math.min(p1.timestamp, p2.timestamp);
  let maxT = Math.max(p1.timestamp, p2.timestamp);
  let minP = Math.min(p1.price, p2.price);
  let maxP = Math.max(p1.price, p2.price);

  switch (handleIndex) {
    // Corner 0: Top-Left (adjusts minT and maxP)
    case 0:
      minT = draggedPoint.timestamp;
      maxP = draggedPoint.price;
      break;
    // Corner 1: Top-Right (adjusts maxT and maxP)
    case 1:
      maxT = draggedPoint.timestamp;
      maxP = draggedPoint.price;
      break;
    // Corner 2: Bottom-Right (adjusts maxT and minP)
    case 2:
      maxT = draggedPoint.timestamp;
      minP = draggedPoint.price;
      break;
    // Corner 3: Bottom-Left (adjusts minT and minP)
    case 3:
      minT = draggedPoint.timestamp;
      minP = draggedPoint.price;
      break;
    // Edge Midpoint 4: Top Edge (adjusts ONLY maxP)
    case 4:
      maxP = draggedPoint.price;
      break;
    // Edge Midpoint 5: Right Edge (adjusts ONLY maxT)
    case 5:
      maxT = draggedPoint.timestamp;
      break;
    // Edge Midpoint 6: Bottom Edge (adjusts ONLY minP)
    case 6:
      minP = draggedPoint.price;
      break;
    // Edge Midpoint 7: Left Edge (adjusts ONLY minT)
    case 7:
      minT = draggedPoint.timestamp;
      break;
    default:
      return currentPoints;
  }

  return [
    { timestamp: minT, price: minP },
    { timestamp: maxT, price: maxP },
  ];
}

/**
 * Solves constraints for Rotated Rectangle handle dragging.
 */
export function solveRotatedRectangleConstraint(
  handleIndex: number,
  draggedPoint: DrawingPoint,
  currentPoints: DrawingPoint[],
): DrawingPoint[] {
  const pts = [...currentPoints];
  if (handleIndex === 0 || handleIndex === 1) {
    const oldAnchor = pts[handleIndex];
    if (oldAnchor) {
      const dt = draggedPoint.timestamp - oldAnchor.timestamp;
      const dp = draggedPoint.price - oldAnchor.price;
      pts[handleIndex] = { ...draggedPoint };
      if (pts[2]) {
        pts[2] = {
          timestamp: pts[2].timestamp + dt,
          price: pts[2].price + dp,
        };
      }
    }
  } else if (handleIndex === 2) {
    pts[2] = { ...draggedPoint };
  }
  return pts;
}

/**
 * Solves topological constraints for Position tools (Long & Short Position).
 * - Handle 0: Take Profit
 * - Handle 1: Stop Loss
 * - Handle 2: Entry Level (shifts entire setup vertically)
 * - Handle 3: Duration / Width
 */
export function solvePositionHandleDrag(
  type: 'long_position' | 'short_position',
  handleIndex: number,
  draggedPoint: DrawingPoint,
  currentPoints: DrawingPoint[],
  _style: DrawingStyle,
): { updatedPoints: DrawingPoint[]; updatedStyle: Partial<DrawingStyle> } {
  const isLong = type === 'long_position';
  const pts = [...currentPoints];
  const entryPrice = pts[0]?.price ?? 1.0;
  const pipSize = getPipSize(entryPrice);
  const minGap = pipSize * 0.5;

  let updatedStyle: Partial<DrawingStyle> = {};

  switch (handleIndex) {
    case 0: {
      // Take Profit (Target)
      let newTp = draggedPoint.price;
      if (isLong) {
        newTp = Math.max(entryPrice + minGap, newTp);
      } else {
        newTp = Math.min(entryPrice - minGap, newTp);
      }
      pts[1] = {
        timestamp: pts[1]?.timestamp ?? pts[0].timestamp,
        price: newTp,
      };
      updatedStyle = { targetPrice: newTp };
      break;
    }
    case 1: {
      // Stop Loss
      let newSl = draggedPoint.price;
      if (isLong) {
        newSl = Math.min(entryPrice - minGap, newSl);
      } else {
        newSl = Math.max(entryPrice + minGap, newSl);
      }
      pts[2] = {
        timestamp: pts[2]?.timestamp ?? pts[0].timestamp,
        price: newSl,
      };
      updatedStyle = { stopPrice: newSl };
      break;
    }
    case 2: {
      // Entry Level: shifts entire position vertically preserving risk/reward distances
      const oldEntry = pts[0].price;
      const dp = draggedPoint.price - oldEntry;
      pts[0] = { ...pts[0], price: draggedPoint.price };
      if (pts[1]) pts[1] = { ...pts[1], price: pts[1].price + dp };
      if (pts[2]) pts[2] = { ...pts[2], price: pts[2].price + dp };
      updatedStyle = {
        entryPrice: draggedPoint.price,
        targetPrice: pts[1]?.price,
        stopPrice: pts[2]?.price,
      };
      break;
    }
    case 3: {
      // Duration / Width Handle: adjusts time extent without modifying price levels
      const newT = Math.max(pts[0].timestamp + 60, draggedPoint.timestamp);
      if (pts[3]) {
        pts[3] = { timestamp: newT, price: pts[3].price };
      } else {
        pts[3] = { timestamp: newT, price: pts[0].price };
      }
      break;
    }
  }

  return { updatedPoints: pts, updatedStyle };
}

/**
 * Constrains translation delta to strictly horizontal or vertical axis (Shift key modifier).
 */
export function constrainAxialTranslation(
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { dx, dy: 0 };
  }
  return { dx: 0, dy };
}

/**
 * Centralized topological constraint solver dispatcher.
 * Resolves handle drags for any tool across the system according to its geometric invariants.
 */
export function solveToolHandleConstraint(
  type: DrawingType,
  handleIndex: number,
  draggedPoint: DrawingPoint,
  currentPoints: DrawingPoint[],
  style: DrawingStyle,
  options?: { isShiftPressed?: boolean },
): { updatedPoints: DrawingPoint[]; updatedStyle?: Partial<DrawingStyle> } {
  switch (type) {
    case 'parallel_channel':
    case 'equidistant_channel':
    case 'fib_channel': {
      const updatedPoints = solveParallelChannelConstraint(handleIndex, draggedPoint, currentPoints);
      return { updatedPoints };
    }
    case 'pitchfork':
    case 'schiff_pitchfork':
    case 'modified_schiff_pitchfork':
    case 'inside_pitchfork': {
      const variant =
        type === 'schiff_pitchfork'
          ? 'schiff'
          : type === 'modified_schiff_pitchfork'
            ? 'modified_schiff'
            : type === 'inside_pitchfork'
              ? 'inside'
              : 'standard';
      const updatedPoints = solvePitchforkConstraint(handleIndex, draggedPoint, currentPoints, variant);
      return { updatedPoints };
    }
    case 'rectangle': {
      const updatedPoints = solveRectangleHandleDrag(
        handleIndex,
        draggedPoint,
        currentPoints,
        options?.isShiftPressed,
      );
      return { updatedPoints };
    }
    case 'rotated_rectangle': {
      const updatedPoints = solveRotatedRectangleConstraint(handleIndex, draggedPoint, currentPoints);
      return { updatedPoints };
    }
    case 'long_position':
    case 'short_position': {
      return solvePositionHandleDrag(type, handleIndex, draggedPoint, currentPoints, style);
    }
    default: {
      const pts = [...currentPoints];
      if (handleIndex >= 0 && handleIndex < pts.length) {
        pts[handleIndex] = { ...draggedPoint };
      }
      return { updatedPoints: pts };
    }
  }
}

