import type { CompactCandleRow } from '../chart/candle-series';
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
  variant: 'standard' | 'schiff' | 'modified_schiff' | boolean = 'standard',
  extent = 2000,
): PitchforkGeometry {
  let origin = { x: p1.x, y: p1.y };
  if (variant === true || variant === 'schiff') {
    origin = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  } else if (variant === 'modified_schiff') {
    origin = { x: p1.x, y: (p1.y + p2.y) / 2 };
  }

  const midpoint = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
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

export interface PositionMetrics {
  isLong: boolean;
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  tpDistance: number;
  slDistance: number;
  pipSize: number;
  tpPips: number;
  slPips: number;
  tpPct: number;
  slPct: number;
  rrRatio: string;
  accountSize: number;
  riskPercent: number;
  riskAmount: number;
  lotSize: number;
  profitDollar: number;
  lossDollar: number;
  endTimestamp: number;
}

export function calculatePositionMetrics(
  type: 'long_position' | 'short_position',
  points: { timestamp: number; price: number }[],
  style: import('./drawing-types').DrawingStyle,
  fallbackAccountBalance = 10000,
): PositionMetrics {
  const isLong = type === 'long_position';
  const entryPrice = points[0]?.price ?? 1.0;

  const pipSize = getPipSize(entryPrice);
  const defaultDelta = entryPrice > 50 ? 0.4 : 0.004;
  const minGap = pipSize * 0.5;

  let tpPrice = points[1]?.price;
  if (tpPrice === undefined || tpPrice === null) {
    tpPrice = isLong ? entryPrice + defaultDelta : entryPrice - defaultDelta;
  } else {
    tpPrice = isLong
      ? Math.max(entryPrice + minGap, tpPrice)
      : Math.min(entryPrice - minGap, tpPrice);
  }

  let slPrice = points[2]?.price;
  if (slPrice === undefined || slPrice === null) {
    slPrice = isLong
      ? entryPrice - Math.abs(tpPrice - entryPrice) / 2
      : entryPrice + Math.abs(entryPrice - tpPrice) / 2;
  } else {
    slPrice = isLong
      ? Math.min(entryPrice - minGap, slPrice)
      : Math.max(entryPrice + minGap, slPrice);
  }

  const endTimestamp =
    points[3]?.timestamp ?? (points[1]?.timestamp || (points[0]?.timestamp ?? Date.now() / 1000) + 3600 * 20);

  const tpDistance = Math.abs(tpPrice - entryPrice);
  const slDistance = Math.abs(entryPrice - slPrice);

  const tpPips = tpDistance / pipSize;
  const slPips = slDistance / pipSize;

  const tpPct = entryPrice > 0 ? (tpDistance / entryPrice) * 100 : 0;
  const slPct = entryPrice > 0 ? (slDistance / entryPrice) * 100 : 0;

  const rrValue = slDistance > 0 ? tpDistance / slDistance : 1.0;
  const rrRatio = rrValue.toFixed(2);

  const accountSize = style.accountSize || fallbackAccountBalance;
  const riskMode = style.riskMode || 'PERCENT';

  let riskAmount = 100;
  let riskPercent = 1.0;

  if (riskMode === 'CASH' && style.riskAmount && style.riskAmount > 0) {
    riskAmount = style.riskAmount;
    riskPercent = accountSize > 0 ? (riskAmount / accountSize) * 100 : 1.0;
  } else {
    riskPercent = style.riskPercent || 1.0;
    riskAmount = accountSize * (riskPercent / 100);
  }

  let pipValuePerLot = 10;
  if (entryPrice > 1000) {
    pipValuePerLot = 1;
  } else if (entryPrice > 50) {
    pipValuePerLot = 1000 * pipSize;
  } else {
    pipValuePerLot = 100000 * pipSize;
  }

  let lotSize = style.lotSize || 1.0;
  if (slPips > 0 && pipValuePerLot > 0) {
    const calculatedLots = riskAmount / (slPips * pipValuePerLot);
    lotSize = Math.max(0.01, Math.round(calculatedLots * 100) / 100);
  }

  const lossDollar = slPips * (lotSize * pipValuePerLot);
  const profitDollar = tpPips * (lotSize * pipValuePerLot);

  return {
    isLong,
    entryPrice,
    tpPrice,
    slPrice,
    tpDistance,
    slDistance,
    pipSize,
    tpPips,
    slPips,
    tpPct,
    slPct,
    rrRatio,
    accountSize,
    riskPercent,
    riskAmount,
    lotSize,
    profitDollar,
    lossDollar,
    endTimestamp,
  };
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

export function findNearestCandleOHLC(
  target: { timestamp: number; price: number },
  candles: CompactCandleRow[],
): { timestamp: number; price: number } | null {
  if (!candles || candles.length === 0) return null;

  let low = 0;
  let high = candles.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const midTime = candles[mid][0];
    if (midTime === target.timestamp) {
      low = mid;
      break;
    } else if (midTime < target.timestamp) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const candidates: number[] = [];
  for (let i = Math.max(0, low - 2); i <= Math.min(candles.length - 1, low + 2); i++) {
    candidates.push(i);
  }

  if (candidates.length === 0) return null;

  let bestCandle = candles[candidates[0]];
  let minTimeDist = Math.abs(bestCandle[0] - target.timestamp);

  for (const idx of candidates) {
    const c = candles[idx];
    const dist = Math.abs(c[0] - target.timestamp);
    if (dist < minTimeDist) {
      minTimeDist = dist;
      bestCandle = c;
    }
  }

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
