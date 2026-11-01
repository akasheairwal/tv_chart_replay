import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { PositionOverlay } from '../chart/position-overlay';
import type { CompactCandleRow } from '../chart/candle-series';
import {
  calculateParallelChannel,
  calculatePitchfork,
  calculatePositionHandleCoords,
  calculatePositionMetrics,
  constrainCircle,
  constrainPointAngle,
  constrainSquare,
  distanceToPoint,
  distanceToRay,
  distanceToSegment,
  findNearestCandleOHLC,
  formatDuration,
  formatVolume,
  getPipSize,
  GANN_FAN_RATIOS,
  isPointInEllipse,
  isPointInPolygon,
  isPointInRect,
} from './drawing-math';
import {
  handleDrawingKeyboardShortcut,
  type IDrawingShortcutTarget,
} from './drawing-shortcuts';
import {
  renderDrawingOnCanvas,
  renderFullCrosshair,
  type RenderContext,
} from './drawing-renderers';
import {
  getRequiredPointCount,
  type DrawingDefinition,
  type DrawingPoint,
  type DrawingStyle,
  type DrawingType,
  type DrawingInteractionState,
} from './drawing-types';
import type { SlTpModificationRequest } from '../ui/sl-tp-confirm-dialog';
import type { PositionDefinition } from '../trading/trading-types';

export function parseTimeValue(val: unknown): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const ts = Math.floor(new Date(val).getTime() / 1000);
    return isNaN(ts) ? null : ts;
  }
  if (val && typeof val === 'object' && 'year' in val && 'month' in val && 'day' in val) {
    const d = val as { year: number; month: number; day: number };
    return Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 1000);
  }
  return null;
}

export function getTimeframeSeconds(tf: string): number {
  const clean = (tf || '1H').trim();
  const map: Record<string, number> = {
    '1m': 60,
    '2m': 120,
    '3m': 180,
    '5m': 300,
    '10m': 600,
    '15m': 900,
    '30m': 1800,
    '45m': 2700,
    '1H': 3600,
    '2H': 7200,
    '4H': 14400,
    '6H': 21600,
    '12H': 43200,
    '1D': 86400,
    '1W': 604800,
    '1M': 2592000,
    '1MONTH': 2592000,
  };
  if (clean in map) return map[clean];
  const upper = clean.toUpperCase();
  if (upper in map) return map[upper];
  if (clean.endsWith('m')) return parseInt(clean, 10) * 60;
  if (clean.endsWith('h') || clean.endsWith('H')) return parseInt(clean, 10) * 3600;
  if (clean.endsWith('d') || clean.endsWith('D')) return parseInt(clean, 10) * 86400;
  if (clean.endsWith('w') || clean.endsWith('W')) return parseInt(clean, 10) * 604800;
  if (clean.endsWith('M')) return parseInt(clean, 10) * 2592000;
  return 3600;
}

export function findCandleIndexForTimestamp(
  candles: CompactCandleRow[],
  timestamp: number,
): number {
  if (candles.length === 0) return 0;
  let low = 0;
  let high = candles.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (candles[mid][0] === timestamp) return mid;
    if (candles[mid][0] < timestamp) low = mid + 1;
    else high = mid - 1;
  }
  return Math.max(0, Math.min(candles.length - 2, high));
}

export class DrawingEngine implements IDrawingShortcutTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private drawings: DrawingDefinition[] = [];
  private currentTool: DrawingType = 'cursor';
  private selectedDrawingId: string | null = null;
  private selectedDrawingIds: Set<string> = new Set();
  private originalMultiPoints: Map<string, DrawingPoint[]> = new Map();
  private isHiddenAllDrawings = false;
  private isMagnetModeEnabled = false;
  private clipboard: DrawingDefinition[] = [];
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private interactionState: DrawingInteractionState = 'IDLE';

  private crosshairPos: { x: number; y: number } | null = null;
  private draftPoints: DrawingPoint[] = [];
  private activeHandleIndex = -1;
  private dragStartPos: { x: number; y: number } | null = null;
  private originalPoints: DrawingPoint[] = [];
  private pointerDownPos: { x: number; y: number } | null = null;
  private pointerDragDist = 0;
  private isShiftPressed = false;
  private lastPointerPos: { x: number; y: number } | null = null;

  private defaultToolStyles: Map<DrawingType, Partial<DrawingStyle>> = new Map();

  private currentSymbol = 'EURUSD';
  private currentTimeframe = '1H';

  private positionOverlay: PositionOverlay;
  private candleData: CompactCandleRow[] = [];
  /** Cache for getBarStats - renderers query the same range every frame. */
  private barStatsCache: {
    key: string;
    dataVersion: number;
    result: ReturnType<DrawingEngine['getBarStats']>;
  } | null = null;
  private cachedPriceRange: { minP: number; maxP: number; dataVersion: number } | null = null;
  private redrawRafId: number | null = null;
  private dataVersion = 0;
  public onOpenDrawingSettings?: (drawing: DrawingDefinition) => void;

  /** Bound listeners kept for clean teardown in destroy(). */
  private onContainerPointerDown = (e: PointerEvent): void => this.handleContainerPointerDown(e);
  private onContainerPointerMove = (e: PointerEvent): void => this.handleContainerPointerMove(e);
  private onContainerPointerUp = (e: PointerEvent): void => this.onPointerUp(e);
  private onContainerPointerCancel = (): void => this.cancelInteraction();
  private onContainerPointerLeave = (): void => this.onPointerLeave();
  private onContainerPointerEnter = (e: PointerEvent): void => this.onPointerEnter(e);
  private onContainerDblClick = (e: MouseEvent): void => this.handleDblClick(e);
  private onContainerMouseDown = (e: MouseEvent): void => this.handleContainerMouseDown(e);
  private onContainerMouseMove = (e: MouseEvent): void => this.handleContainerMouseMove(e);
  private onContainerMouseUp = (e: MouseEvent): void => this.handleContainerMouseUp(e);
  private onContainerTouchStart = (e: TouchEvent): void => this.handleContainerTouchStart(e);
  private onContainerTouchMove = (e: TouchEvent): void => this.handleContainerTouchMove(e);
  private onWindowKeyDownShift = (e: KeyboardEvent): void => {
    if (e.key === 'Shift' && !this.isShiftPressed) {
      this.isShiftPressed = true;
      if (this.lastPointerPos) {
        this.reprocessPointerPosition(this.lastPointerPos);
      }
    }
    this.onKeyDown(e);
  };
  private onWindowKeyUpShift = (e: KeyboardEvent): void => {
    if (e.key === 'Shift' && this.isShiftPressed) {
      this.isShiftPressed = false;
      if (this.lastPointerPos) {
        this.reprocessPointerPosition(this.lastPointerPos);
      }
    }
  };
  private onWheelCapture = (e: WheelEvent): void => {
    // Let wheel events reach the chart (zoom/scroll) unless an interaction
    // is actively in progress. The overlay canvas itself never captures
    // pointer/wheel input, so tools no longer freeze chart navigation.
    const interacting =
      this.interactionState === 'DRAWING' ||
      this.interactionState === 'MOVING' ||
      this.interactionState === 'EDITING_HANDLE' ||
      this.positionOverlay.getActiveDrag() !== null;
    if (interacting) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  private unsubscribeFns: (() => void)[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly chart: IChartApi,
    private readonly series: ISeriesApi<'Candlestick'>,
    private readonly onSave?: (drawing: DrawingDefinition) => void,
    private readonly onDelete?: (id: string) => void,
    private readonly onSelectionChange?: (drawing: DrawingDefinition | null) => void,
    private readonly onToolChange?: (tool: DrawingType) => void,
    private readonly onClosePosition?: (positionId: string, currentPrice: number) => void,
    private readonly onModifySlTpRequest?: (req: SlTpModificationRequest) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'drawing-canvas-overlay';
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '5';
    this.container.style.position = 'relative';
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.positionOverlay = new PositionOverlay(this.onClosePosition);
    this.resize();
    this.wireEvents();
  }

  setCandleData(rows: CompactCandleRow[]): void {
    this.candleData = rows || [];
    this.dataVersion++;
    this.redraw();
  }

  appendCandle(row: CompactCandleRow): void {
    if (this.candleData.length > 0) {
      const last = this.candleData[this.candleData.length - 1];
      // Out-of-order (older) rows would corrupt the sorted-array assumption
      // behind the binary search mapping in chartToPixel/pixelToChart.
      if (row[0] < last[0]) return;
      if (last[0] === row[0]) {
        this.candleData[this.candleData.length - 1] = row;
        this.redraw();
        return;
      }
    }
    this.candleData.push(row);
    this.dataVersion++;
    this.redraw();
  }

  getBarStats(
    t1: number,
    t2: number,
    _p1?: number,
    _p2?: number,
  ): {
    barsCount: number;
    barCount: number;
    durationSec: number;
    durationText: string;
    totalVolume: number;
    volume: number;
    volumeText: string;
  } {
    const minT = Math.min(t1, t2);
    const maxT = Math.max(t1, t2);
    const durationSec = Math.abs(t2 - t1);
    const durationText = formatDuration(durationSec);

    // Renderers query identical ranges every frame; cache by range + data
    // version instead of rescanning the full candle array per redraw.
    const key = `${minT}:${maxT}`;
    if (
      this.barStatsCache &&
      this.barStatsCache.key === key &&
      this.barStatsCache.dataVersion === this.dataVersion
    ) {
      return this.barStatsCache.result;
    }

    let result;
    if (this.candleData.length > 0) {
      let count = 0;
      let totalVol = 0;
      for (let i = 0; i < this.candleData.length; i++) {
        const c = this.candleData[i];
        if (c[0] >= minT && c[0] <= maxT) {
          count++;
          totalVol += c[5] || 0;
        }
      }
      const finalCount = Math.max(1, count);
      result = {
        barsCount: finalCount,
        barCount: finalCount,
        durationSec,
        durationText,
        totalVolume: totalVol,
        volume: totalVol,
        volumeText: formatVolume(totalVol),
      };
    } else {
      const tfSec = getTimeframeSeconds(this.currentTimeframe);
      const barCount = Math.max(1, Math.round(durationSec / tfSec));
      result = {
        barsCount: barCount,
        barCount,
        durationSec,
        durationText,
        totalVolume: 0,
        volume: 0,
        volumeText: '',
      };
    }

    this.barStatsCache = { key, dataVersion: this.dataVersion, result };
    return result;
  }

  setPositions(positions: PositionDefinition[]): void {
    this.positionOverlay.setPositions(positions);
    this.redraw();
  }

  setLatestPrice(price: number, skipRedraw = false): void {
    this.positionOverlay.setLatestPrice(price);
    if (!skipRedraw) {
      this.redraw();
    }
  }

  setContext(symbol: string, timeframe: string): void {
    this.currentSymbol = symbol;
    this.currentTimeframe = timeframe;
    this.positionOverlay.setSymbol(symbol);
    this.redraw();
  }

  setTool(tool: DrawingType): void {
    this.currentTool = tool;
    this.draftPoints = [];
    this.pointerDownPos = null;
    this.activeHandleIndex = -1;
    this.dragStartPos = null;
    this.selectedDrawingId = null;

    if (tool === 'cursor') {
      this.interactionState = 'IDLE';
      this.container.style.cursor = '';
      this.crosshairPos = null;
      this.setChartScrollEnabled(true);
    } else {
      this.interactionState = 'TOOL_SELECTED';
      this.container.style.cursor = 'crosshair';
      this.setChartScrollEnabled(false);
    }
    // The overlay canvas is a pure render surface: it NEVER captures
    // pointer/wheel input. Interaction routing happens on the container in
    // the capture phase, so wheel zoom/scroll keeps working even while a
    // drawing tool is armed.
    this.canvas.style.pointerEvents = 'none';
    this.redraw();
    if (this.onToolChange) this.onToolChange(tool);
    if (this.onSelectionChange) this.onSelectionChange(null);
  }

  getCurrentTool(): DrawingType {
    return this.currentTool;
  }

  /**
   * Toggles mouse-drag / touch panning on the chart.
   * Suppresses chart panning while drawing or dragging overlay objects.
   */
  private setChartScrollEnabled(enabled: boolean): void {
    if (!this.chart || typeof this.chart.applyOptions !== 'function') return;
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

  setDrawings(drawings: DrawingDefinition[]): void {
    // Normalize persisted records: older saves may lack visible/locked and
    // strict truthiness checks would render them permanently dead.
    this.drawings = (drawings || []).map((d) => ({
      ...d,
      visible: d.visible !== false,
      locked: d.locked === true,
      points: Array.isArray(d.points) ? d.points : [],
    }));
    this.selectedDrawingId = null;
    this.interactionState = this.currentTool === 'cursor' ? 'IDLE' : 'TOOL_SELECTED';
    this.redraw();
  }

  getDrawings(): DrawingDefinition[] {
    return this.drawings;
  }

  getSelectedDrawing(): DrawingDefinition | null {
    if (!this.selectedDrawingId) return null;
    return this.drawings.find((d) => d.id === this.selectedDrawingId) || null;
  }

  recordHistory(): void {
    this.undoStack.push(JSON.stringify(this.drawings));
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(JSON.stringify(this.drawings));
    const prev = this.undoStack.pop()!;
    this.drawings = JSON.parse(prev);
    this.selectDrawing(null);
    this.redraw();
    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(JSON.stringify(this.drawings));
    const next = this.redoStack.pop()!;
    this.drawings = JSON.parse(next);
    this.selectDrawing(null);
    this.redraw();
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  selectDrawing(id: string | null): void {
    this.selectedDrawingId = id;
    this.selectedDrawingIds.clear();
    if (id) {
      this.selectedDrawingIds.add(id);
    }
    const selected = id ? this.drawings.find((d) => d.id === id) || null : null;
    if (this.currentTool === 'cursor') {
      this.interactionState = selected ? 'SELECTED' : 'IDLE';
    }
    this.redraw();
    if (this.onSelectionChange) {
      this.onSelectionChange(selected);
    }
  }

  getSelectedDrawingIds(): string[] {
    return Array.from(this.selectedDrawingIds);
  }

  selectDrawings(ids: string[]): void {
    this.selectedDrawingIds = new Set(ids);
    this.selectedDrawingId = ids[0] || null;
    const selected = this.getSelectedDrawing();
    if (this.currentTool === 'cursor') {
      this.interactionState = selected ? 'SELECTED' : 'IDLE';
    }
    this.redraw();
    if (this.onSelectionChange) {
      this.onSelectionChange(selected);
    }
  }

  toggleDrawingSelection(id: string): void {
    if (this.selectedDrawingIds.has(id)) {
      this.selectedDrawingIds.delete(id);
      this.selectedDrawingId = this.selectedDrawingIds.values().next().value || null;
    } else {
      this.selectedDrawingIds.add(id);
      this.selectedDrawingId = id;
    }
    const selected = this.getSelectedDrawing();
    if (this.currentTool === 'cursor') {
      this.interactionState = selected ? 'SELECTED' : 'IDLE';
    }
    this.redraw();
    if (this.onSelectionChange) {
      this.onSelectionChange(selected);
    }
  }

  toggleHideAllDrawings(): boolean {
    this.isHiddenAllDrawings = !this.isHiddenAllDrawings;
    this.redraw();
    return this.isHiddenAllDrawings;
  }

  isAllDrawingsHidden(): boolean {
    return this.isHiddenAllDrawings;
  }

  setHideAllDrawings(hide: boolean): void {
    this.isHiddenAllDrawings = hide;
    this.redraw();
  }

  setMagnetMode(enabled: boolean): void {
    this.isMagnetModeEnabled = enabled;
  }

  isMagnetMode(): boolean {
    return this.isMagnetModeEnabled;
  }

  toggleMagnetMode(): boolean {
    this.isMagnetModeEnabled = !this.isMagnetModeEnabled;
    return this.isMagnetModeEnabled;
  }

  copySelected(): boolean {
    const targetIds =
      this.selectedDrawingIds.size > 0
        ? this.selectedDrawingIds
        : this.selectedDrawingId
          ? new Set([this.selectedDrawingId])
          : null;
    if (!targetIds || targetIds.size === 0) return false;

    const toCopy = this.drawings.filter((d) => targetIds.has(d.id));
    if (toCopy.length === 0) return false;

    this.clipboard = toCopy.map((d) => JSON.parse(JSON.stringify(d)));
    return true;
  }

  paste(): DrawingDefinition[] {
    if (this.clipboard.length === 0) return [];
    this.recordHistory();

    const tfSec = getTimeframeSeconds(this.currentTimeframe);
    const pasted: DrawingDefinition[] = [];

    for (const item of this.clipboard) {
      const clone: DrawingDefinition = {
        ...item,
        id: `draw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        points: item.points.map((p) => ({
          timestamp: p.timestamp + tfSec * 3,
          price: p.price,
        })),
        style: { ...item.style },
        locked: false,
        visible: true,
      };
      this.drawings.push(clone);
      pasted.push(clone);
      if (this.onSave) this.onSave(clone);
    }

    this.selectDrawings(pasted.map((d) => d.id));
    this.redraw();
    return pasted;
  }

  nudgeSelected(dBars: number, dTicks: number, stepMultiplier = 1): void {
    const targetIds =
      this.selectedDrawingIds.size > 0
        ? this.selectedDrawingIds
        : this.selectedDrawingId
          ? new Set([this.selectedDrawingId])
          : null;
    if (!targetIds || targetIds.size === 0) return;

    this.recordHistory();

    const tfSec = getTimeframeSeconds(this.currentTimeframe);
    const dTime = dBars * tfSec * stepMultiplier;

    const firstDrawing = this.drawings.find((d) => targetIds.has(d.id));
    const samplePrice = firstDrawing?.points[0]?.price ?? 1.0;
    const pip = getPipSize(samplePrice);
    const dPrice = dTicks * pip * stepMultiplier;

    for (const d of this.drawings) {
      if (!targetIds.has(d.id) || d.locked) continue;
      for (const p of d.points) {
        p.timestamp += dTime;
        p.price += dPrice;
      }
      if (this.onSave) this.onSave(d);
    }

    this.redraw();
  }

  getToolDefaultStyle(tool?: DrawingType): DrawingStyle {
    const targetTool = tool || this.currentTool;
    const custom = this.defaultToolStyles.get(targetTool) || {};

    let baseColor = targetTool.startsWith('fib') ? '#ff9800' : '#2962ff';
    let baseWidth = 2;
    if (targetTool === 'brush') {
      baseWidth = 4;
    } else if (targetTool === 'pencil') {
      baseWidth = 2;
    } else if (targetTool === 'pen') {
      baseWidth = 2.5;
    }

    return {
      color: baseColor,
      width: baseWidth,
      lineStyle: 'solid',
      fillColor: 'rgba(41, 98, 255, 0.15)',
      ...custom,
    };
  }

  updateToolDefaultStyle(tool: DrawingType, styleUpdates: Partial<DrawingStyle>): void {
    const current = this.defaultToolStyles.get(tool) || {};
    this.defaultToolStyles.set(tool, { ...current, ...styleUpdates });
    this.redraw();
  }

  updateDrawingStyle(id: string, styleUpdates: Partial<DrawingStyle>): void {
    const d = this.drawings.find((item) => item.id === id);
    if (!d) return;
    d.style = { ...d.style, ...styleUpdates };
    this.redraw();
    if (this.onSave) this.onSave(d);
  }

  toggleLock(id: string): void {
    const d = this.drawings.find((item) => item.id === id);
    if (!d) return;
    d.locked = !d.locked;
    this.redraw();
    if (this.onSave) this.onSave(d);
  }

  toggleVisibility(id: string): void {
    const d = this.drawings.find((item) => item.id === id);
    if (!d) return;
    d.visible = !d.visible;
    this.redraw();
    if (this.onSave) this.onSave(d);
  }

  setAllVisibility(visible: boolean): void {
    for (const d of this.drawings) {
      d.visible = visible;
      if (this.onSave) this.onSave(d);
    }
    this.redraw();
  }

  duplicateDrawing(id: string): DrawingDefinition | null {
    const d = this.drawings.find((item) => item.id === id);
    if (!d) return null;

    this.recordHistory();
    const tfSec = getTimeframeSeconds(this.currentTimeframe);
    const newDrawing: DrawingDefinition = {
      ...d,
      id: `draw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      points: d.points.map((p) => ({
        timestamp: p.timestamp + tfSec * 5,
        price: p.price,
      })),
      style: { ...d.style },
      locked: false,
    };
    this.drawings.push(newDrawing);
    this.selectDrawing(newDrawing.id);
    if (this.onSave) this.onSave(newDrawing);
    return newDrawing;
  }

  deleteDrawing(id: string): void {
    const idx = this.drawings.findIndex((d) => d.id === id);
    if (idx >= 0) {
      this.recordHistory();
      this.drawings.splice(idx, 1);
      this.selectedDrawingIds.delete(id);
      if (this.selectedDrawingId === id) {
        this.selectedDrawingId = this.selectedDrawingIds.values().next().value || null;
        if (this.onSelectionChange) {
          const newSel = this.selectedDrawingId
            ? this.drawings.find((d) => d.id === this.selectedDrawingId) || null
            : null;
          this.onSelectionChange(newSel);
        }
      }
      this.redraw();
      if (this.onDelete) this.onDelete(id);
    }
  }

  deleteSelected(): void {
    const ids =
      this.selectedDrawingIds.size > 0
        ? Array.from(this.selectedDrawingIds)
        : this.selectedDrawingId
          ? [this.selectedDrawingId]
          : [];
    if (ids.length === 0) return;

    this.recordHistory();
    for (const id of ids) {
      const idx = this.drawings.findIndex((d) => d.id === id);
      if (idx >= 0) {
        this.drawings.splice(idx, 1);
        if (this.onDelete) this.onDelete(id);
      }
    }
    this.selectedDrawingIds.clear();
    this.selectedDrawingId = null;
    this.interactionState = 'IDLE';
    this.redraw();
    if (this.onSelectionChange) this.onSelectionChange(null);
  }

  clearAll(): void {
    const ids = this.drawings.map((d) => d.id);
    this.drawings = [];
    this.selectedDrawingId = null;
    this.interactionState = 'IDLE';
    if (this.currentTool === 'cursor') {
      this.setChartScrollEnabled(true);
    }
    this.redraw();
    if (this.onSelectionChange) this.onSelectionChange(null);
    for (const id of ids) {
      if (this.onDelete) this.onDelete(id);
    }
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 500;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (this.ctx && typeof this.ctx.scale === 'function') {
      this.ctx.scale(dpr, dpr);
    }
    this.redraw();
  }

  // -- Coordinate Conversion ----------------------------------------

  chartToPixel(point: DrawingPoint): { x: number; y: number } | null {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    // 1. Price -> Y coordinate
    let y: number | null = this.series?.priceToCoordinate?.(point.price) ?? null;
    if (y === null) {
      try {
        const priceScale = (this.series as any).priceScale?.();
        const range = priceScale?.getVisiblePriceRange?.();
        if (
          range &&
          typeof range.minValue === 'number' &&
          typeof range.maxValue === 'number' &&
          range.maxValue > range.minValue
        ) {
          const t = (point.price - range.minValue) / (range.maxValue - range.minValue);
          y = (1 - t) * h;
        }
      } catch {
        // ignore
      }
    }

    if (y === null && this.candleData.length > 0) {
      if (
        !this.cachedPriceRange ||
        this.cachedPriceRange.dataVersion !== this.dataVersion
      ) {
        let minP = Infinity;
        let maxP = -Infinity;
        for (let i = 0; i < this.candleData.length; i++) {
          const c = this.candleData[i];
          if (c[3] < minP) minP = c[3];
          if (c[2] > maxP) maxP = c[2];
        }
        this.cachedPriceRange = { minP, maxP, dataVersion: this.dataVersion };
      }
      const { minP, maxP } = this.cachedPriceRange;
      if (maxP > minP && isFinite(minP) && isFinite(maxP)) {
        const pad = (maxP - minP) * 0.08;
        const pMin = minP - pad;
        const pMax = maxP + pad;
        const t = (point.price - pMin) / (pMax - pMin);
        y = (1 - t) * h;
      }
    }

    if (y === null) {
      y = (1 - (point.price - 100.0) / 10.0) * h;
    }

    // 2. Time -> X coordinate
    let x: number | null = null;
    const timeScale = this.chart.timeScale?.();

    if (timeScale && point.timestamp !== undefined && !isNaN(point.timestamp)) {
      try {
        const coord = timeScale.timeToCoordinate(point.timestamp as any);
        if (coord !== null) x = coord;
      } catch {
        // ignore
      }
    }

    if (x === null && timeScale && point.timestamp !== undefined && !isNaN(point.timestamp)) {
      const tfSec = Math.max(1, getTimeframeSeconds(this.currentTimeframe));

      if (this.candleData.length > 0) {
        const tFirst = this.candleData[0][0];
        const tLast = this.candleData[this.candleData.length - 1][0];

        let L_last = this.candleData.length - 1;
        try {
          const xLast = timeScale.timeToCoordinate?.(tLast as any);
          if (xLast !== null && xLast !== undefined) {
            const lVal = timeScale.coordinateToLogical?.(xLast);
            if (lVal !== null && lVal !== undefined) L_last = lVal;
          }
        } catch {
          // ignore
        }

        let L_first = 0;
        try {
          const xFirst = timeScale.timeToCoordinate?.(tFirst as any);
          if (xFirst !== null && xFirst !== undefined) {
            const lVal = timeScale.coordinateToLogical?.(xFirst);
            if (lVal !== null && lVal !== undefined) L_first = lVal;
          }
        } catch {
          // ignore
        }

        let logical: number | null = null;

        if (point.timestamp >= tLast) {
          const deltaSec = point.timestamp - tLast;
          logical = L_last + deltaSec / tfSec;
        } else if (point.timestamp <= tFirst) {
          const deltaSec = tFirst - point.timestamp;
          logical = L_first - deltaSec / tfSec;
        } else {
          // Point lies between tFirst and tLast (e.g., gap between candles)
          const idx = findCandleIndexForTimestamp(this.candleData, point.timestamp);
          const cA = this.candleData[idx];
          const cB = this.candleData[Math.min(this.candleData.length - 1, idx + 1)];
          const tA = cA[0];
          const tB = cB[0];

          let LA = idx;
          let LB = Math.min(this.candleData.length - 1, idx + 1);
          try {
            const xA = timeScale.timeToCoordinate?.(tA as any);
            if (xA !== null && xA !== undefined) {
              const lA = timeScale.coordinateToLogical?.(xA);
              if (lA !== null && lA !== undefined) LA = lA;
            }
            const xB = timeScale.timeToCoordinate?.(tB as any);
            if (xB !== null && xB !== undefined) {
              const lB = timeScale.coordinateToLogical?.(xB);
              if (lB !== null && lB !== undefined) LB = lB;
            }
          } catch {
            // ignore
          }

          if (tB > tA) {
            const frac = (point.timestamp - tA) / (tB - tA);
            logical = LA + frac * (LB - LA);
          } else {
            logical = LA;
          }
        }

        if (logical !== null) {
          try {
            const coord = timeScale.logicalToCoordinate?.(logical as any);
            if (coord !== null && coord !== undefined) {
              x = coord;
            }
          } catch {
            // ignore
          }
        }
      } else {
        // Fallback using visible ranges when candleData is empty
        try {
          const visRange = timeScale.getVisibleRange?.();
          const logRange = timeScale.getVisibleLogicalRange?.();
          if (visRange && visRange.from && visRange.to && logRange && logRange.to > logRange.from) {
            const tFrom = parseTimeValue(visRange.from);
            const tTo = parseTimeValue(visRange.to);
            if (tFrom !== null && tTo !== null && tTo > tFrom) {
              let logFrom = logRange.from;
              let logTo = logRange.to;
              const xFrom = timeScale.timeToCoordinate?.(visRange.from as any);
              const xTo = timeScale.timeToCoordinate?.(visRange.to as any);
              if (xFrom !== null && xFrom !== undefined) {
                const lF = timeScale.coordinateToLogical?.(xFrom);
                if (lF !== null && lF !== undefined) logFrom = lF;
              }
              if (xTo !== null && xTo !== undefined) {
                const lT = timeScale.coordinateToLogical?.(xTo);
                if (lT !== null && lT !== undefined) logTo = lT;
              }
              const frac = (point.timestamp - tFrom) / (tTo - tFrom);
              const logical = logFrom + frac * (logTo - logFrom);
              const coord = timeScale.logicalToCoordinate?.(logical as any);
              if (coord !== null && coord !== undefined) {
                x = coord;
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    if (x === null) {
      x = w / 2;
    }

    return { x, y };
  }

  pixelToChart(x: number, y: number): DrawingPoint | null {
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    let price: number | null = this.series?.coordinateToPrice?.(y) ?? null;

    if (price === null) {
      try {
        const priceScale = (this.series as any).priceScale?.();
        const range = priceScale?.getVisiblePriceRange?.();
        if (
          range &&
          typeof range.minValue === 'number' &&
          typeof range.maxValue === 'number' &&
          range.maxValue > range.minValue
        ) {
          const t = 1 - Math.max(0, Math.min(1, y / h));
          price = range.minValue + t * (range.maxValue - range.minValue);
        }
      } catch {
        // ignore
      }
    }

    if (price === null && this.candleData.length > 0) {
      let minP = Infinity;
      let maxP = -Infinity;
      for (let i = 0; i < this.candleData.length; i++) {
        const c = this.candleData[i];
        if (c[3] < minP) minP = c[3];
        if (c[2] > maxP) maxP = c[2];
      }
      if (maxP > minP && isFinite(minP) && isFinite(maxP)) {
        const pad = (maxP - minP) * 0.08;
        const pMin = minP - pad;
        const pMax = maxP + pad;
        price = pMax - (y / h) * (pMax - pMin);
      }
    }

    if (price === null || isNaN(price)) {
      price = 100.0 + (1 - y / h) * 10.0;
    }

    let timestamp: number | null = null;
    const timeScale = this.chart.timeScale?.();

    if (timeScale) {
      const rawTime = timeScale.coordinateToTime?.(x);
      timestamp = parseTimeValue(rawTime);

      if (timestamp === null) {
        const logical = timeScale.coordinateToLogical?.(x);
        if (logical !== null && logical !== undefined) {
          const tfSec = Math.max(1, getTimeframeSeconds(this.currentTimeframe));

          if (this.candleData.length > 0) {
            const tFirst = this.candleData[0][0];
            const tLast = this.candleData[this.candleData.length - 1][0];

            let L_last = this.candleData.length - 1;
            try {
              const xLast = timeScale.timeToCoordinate?.(tLast as any);
              if (xLast !== null && xLast !== undefined) {
                const lVal = timeScale.coordinateToLogical?.(xLast);
                if (lVal !== null && lVal !== undefined) L_last = lVal;
              }
            } catch {
              // ignore
            }

            let L_first = 0;
            try {
              const xFirst = timeScale.timeToCoordinate?.(tFirst as any);
              if (xFirst !== null && xFirst !== undefined) {
                const lVal = timeScale.coordinateToLogical?.(xFirst);
                if (lVal !== null && lVal !== undefined) L_first = lVal;
              }
            } catch {
              // ignore
            }

            if (logical >= L_last) {
              const deltaBars = logical - L_last;
              timestamp = Math.round(tLast + deltaBars * tfSec);
            } else if (logical <= L_first) {
              const deltaBars = L_first - logical;
              timestamp = Math.round(tFirst - deltaBars * tfSec);
            } else {
              // Point is between L_first and L_last in a gap
              const idx = Math.floor(logical);
              const frac = logical - idx;
              const idxA = Math.max(0, Math.min(this.candleData.length - 2, idx));
              const tA = this.candleData[idxA][0];
              const tB = this.candleData[idxA + 1][0];
              timestamp = Math.round(tA + frac * (tB - tA));
            }
          } else {
            // Candle data empty fallback using visible ranges
            try {
              const visRange = timeScale.getVisibleRange?.();
              const logRange = timeScale.getVisibleLogicalRange?.();
              if (visRange && visRange.from && visRange.to && logRange && logRange.to > logRange.from) {
                const tFrom = parseTimeValue(visRange.from);
                const tTo = parseTimeValue(visRange.to);
                if (tFrom !== null && tTo !== null && tTo > tFrom) {
                  let logFrom = logRange.from;
                  let logTo = logRange.to;
                  const xFrom = timeScale.timeToCoordinate?.(visRange.from as any);
                  const xTo = timeScale.timeToCoordinate?.(visRange.to as any);
                  if (xFrom !== null && xFrom !== undefined) {
                    const lF = timeScale.coordinateToLogical?.(xFrom);
                    if (lF !== null && lF !== undefined) logFrom = lF;
                  }
                  if (xTo !== null && xTo !== undefined) {
                    const lT = timeScale.coordinateToLogical?.(xTo);
                    if (lT !== null && lT !== undefined) logTo = lT;
                  }
                  if (logTo > logFrom) {
                    const frac = (logical - logFrom) / (logTo - logFrom);
                    timestamp = Math.round(tFrom + frac * (tTo - tFrom));
                  }
                }
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }

    if (timestamp === null || isNaN(timestamp)) {
      timestamp = Math.round(Date.now() / 1000);
    }

    return { timestamp, price };
  }

  // -- Interactive Hit Testing for Pointer Routing -------------------

  private isPointerOverInteractiveTarget(
    px: number,
    py: number,
  ): { hit: boolean; cursor: string; isHandle: boolean } {
    if (this.selectedDrawingId) {
      const selected = this.drawings.find((d) => d.id === this.selectedDrawingId);
      if (selected && !selected.locked && selected.visible) {
        const hIdx = this.hitTestHandles(selected, px, py);
        if (hIdx >= 0) {
          let cursor = 'pointer';
          if (selected.type === 'long_position' || selected.type === 'short_position') {
            if (hIdx === 0) cursor = 'move';
            else if (hIdx === 1 || hIdx === 2) cursor = 'ns-resize';
            else if (hIdx === 3) cursor = 'ew-resize';
            else if (hIdx === 4) cursor = 'nwse-resize';
            else if (hIdx === 5) cursor = 'nesw-resize';
          }
          return { hit: true, cursor, isHandle: true };
        }
        if (this.hitTestDrawing(selected, px, py)) {
          return { hit: true, cursor: 'move', isHandle: false };
        }
      }
    }

    const hitDrawing = this.findDrawingAt(px, py);
    if (hitDrawing) {
      return { hit: true, cursor: 'pointer', isHandle: false };
    }

    if (this.positionOverlay.hitTest(px, py)) {
      return { hit: true, cursor: 'pointer', isHandle: false };
    }

    return { hit: false, cursor: 'default', isHandle: false };
  }

  // -- Shift Key Orthogonal / Angle Constraining -------------------

  private getEffectivePointerPos(
    pos: { x: number; y: number },
    shiftPressed: boolean,
    modPressed = false,
  ): { x: number; y: number } {
    let result = pos;

    if (shiftPressed) {
      if (this.interactionState === 'DRAWING' && this.draftPoints.length > 0) {
        const anchorIdx = Math.max(0, this.draftPoints.length - 2);
        const anchorChart = this.draftPoints[anchorIdx];
        if (anchorChart) {
          const anchorPix = this.chartToPixel(anchorChart);
          if (anchorPix) {
            if (this.currentTool === 'rectangle' || this.currentTool === 'gann_box') {
              result = constrainSquare(pos, anchorPix);
            } else if (this.currentTool === 'ellipse' || this.currentTool === 'circle') {
              result = constrainCircle(pos, anchorPix);
            } else {
              result = constrainPointAngle(pos, anchorPix);
            }
          }
        }
      } else if (
        this.interactionState === 'EDITING_HANDLE' &&
        this.selectedDrawingId &&
        this.activeHandleIndex >= 0
      ) {
        const selected = this.drawings.find((d) => d.id === this.selectedDrawingId);
        if (selected && selected.points.length > 0) {
          const anchorIdx =
            this.activeHandleIndex === 0
              ? Math.min(1, selected.points.length - 1)
              : Math.max(0, this.activeHandleIndex - 1);
          const anchorChart = selected.points[anchorIdx];
          if (anchorChart) {
            const anchorPix = this.chartToPixel(anchorChart);
            if (anchorPix) {
              if (selected.type === 'rectangle' || selected.type === 'gann_box') {
                result = constrainSquare(pos, anchorPix);
              } else if (selected.type === 'ellipse' || selected.type === 'circle') {
                result = constrainCircle(pos, anchorPix);
              } else {
                result = constrainPointAngle(pos, anchorPix);
              }
            }
          }
        }
      }
    }

    const shouldMagnet = this.isMagnetModeEnabled !== Boolean(modPressed);
    if (shouldMagnet && this.candleData.length > 0) {
      const chartPos = this.pixelToChart(result.x, result.y);
      if (chartPos) {
        const snapped = findNearestCandleOHLC(chartPos, this.candleData);
        if (snapped) {
          const snappedPix = this.chartToPixel(snapped);
          if (snappedPix) {
            result = snappedPix;
          }
        }
      }
    }

    return result;
  }

  private reprocessPointerPosition(rawPos: { x: number; y: number }): void {
    const pos = this.getEffectivePointerPos(rawPos, this.isShiftPressed);

    if (this.interactionState === 'DRAWING' && this.draftPoints.length > 0) {
      const chartPos = this.pixelToChart(pos.x, pos.y);
      if (chartPos) {
        this.draftPoints[this.draftPoints.length - 1] = chartPos;
      }
      if (this.currentTool !== 'cursor') {
        this.crosshairPos = pos;
      }
      this.redraw();
    } else if (
      this.interactionState === 'EDITING_HANDLE' &&
      this.selectedDrawingId &&
      this.activeHandleIndex >= 0
    ) {
      const chartPos = this.pixelToChart(pos.x, pos.y);
      if (chartPos) {
        const selected = this.drawings.find((d) => d.id === this.selectedDrawingId);
        if (selected && !selected.locked) {
          selected.points[this.activeHandleIndex] = chartPos;
          this.redraw();
        }
      }
    }
  }

  // -- Event Wiring -------------------------------------------------

  private wireEvents(): void {
    // All interaction is routed through the CONTAINER in the capture phase.
    // Capture runs before the lightweight-charts canvases receive the
    // events, so we can consume clicks/drags meant for drawings with
    // stopPropagation() while letting everything else (wheel zoom, chart
    // pan) pass through untouched.
    this.container.addEventListener('pointerdown', this.onContainerPointerDown, true);
    this.container.addEventListener('pointermove', this.onContainerPointerMove, true);
    this.container.addEventListener('pointerup', this.onContainerPointerUp, true);
    this.container.addEventListener('pointercancel', this.onContainerPointerCancel, true);
    this.container.addEventListener('pointerenter', this.onContainerPointerEnter, true);
    this.container.addEventListener('pointerleave', this.onContainerPointerLeave, true);
    this.container.addEventListener('dblclick', this.onContainerDblClick, true);
    this.container.addEventListener('wheel', this.onWheelCapture, { capture: true, passive: false });
    this.container.addEventListener('mousedown', this.onContainerMouseDown, true);
    this.container.addEventListener('mousemove', this.onContainerMouseMove, true);
    this.container.addEventListener('mouseup', this.onContainerMouseUp, true);
    this.container.addEventListener('touchstart', this.onContainerTouchStart, { capture: true, passive: false });
    this.container.addEventListener('touchmove', this.onContainerTouchMove, { capture: true, passive: false });

    const timeScale = this.chart.timeScale?.();
    if (timeScale) {
      if (typeof timeScale.subscribeVisibleTimeRangeChange === 'function') {
        const cb = () => this.redraw();
        timeScale.subscribeVisibleTimeRangeChange(cb);
        this.unsubscribeFns.push(() => {
          try {
            timeScale.unsubscribeVisibleTimeRangeChange(cb);
          } catch {
            // ignore
          }
        });
      }
      if (typeof timeScale.subscribeVisibleLogicalRangeChange === 'function') {
        const cb = () => this.redraw();
        timeScale.subscribeVisibleLogicalRangeChange(cb);
        this.unsubscribeFns.push(() => {
          try {
            timeScale.unsubscribeVisibleLogicalRangeChange(cb);
          } catch {
            // ignore
          }
        });
      }
    }

    window.addEventListener('keydown', this.onWindowKeyDownShift);
    window.addEventListener('keyup', this.onWindowKeyUpShift);
  }

  private handleDblClick(e: MouseEvent): void {
    const pos = this.getPosFromClient(e.clientX, e.clientY);
    const hit = this.findDrawingAt(pos.x, pos.y);
    if (hit) {
      e.stopPropagation();
      e.preventDefault();
      this.selectDrawing(hit.id);
      if (this.onOpenDrawingSettings) {
        this.onOpenDrawingSettings(hit);
      }
    }
  }

  private handleContainerMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const rawPos = this.getPosFromClient(e.clientX, e.clientY);
    const interacting =
      this.interactionState === 'DRAWING' ||
      this.interactionState === 'MOVING' ||
      this.interactionState === 'EDITING_HANDLE' ||
      this.positionOverlay.getActiveDrag() !== null ||
      this.currentTool !== 'cursor';

    if (interacting) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    const target = this.isPointerOverInteractiveTarget(rawPos.x, rawPos.y);
    if (target.hit) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  private handleContainerMouseMove(e: MouseEvent): void {
    const interacting =
      this.interactionState === 'DRAWING' ||
      this.interactionState === 'MOVING' ||
      this.interactionState === 'EDITING_HANDLE' ||
      this.positionOverlay.getActiveDrag() !== null;

    if (interacting) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  private handleContainerMouseUp(e: MouseEvent): void {
    const interacting =
      this.interactionState === 'DRAWING' ||
      this.interactionState === 'MOVING' ||
      this.interactionState === 'EDITING_HANDLE' ||
      this.positionOverlay.getActiveDrag() !== null;

    if (interacting) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  private handleContainerTouchStart(e: TouchEvent): void {
    const interacting =
      this.interactionState === 'DRAWING' ||
      this.interactionState === 'MOVING' ||
      this.interactionState === 'EDITING_HANDLE' ||
      this.positionOverlay.getActiveDrag() !== null ||
      this.currentTool !== 'cursor';

    if (interacting) {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }
  }

  private handleContainerTouchMove(e: TouchEvent): void {
    const interacting =
      this.interactionState === 'DRAWING' ||
      this.interactionState === 'MOVING' ||
      this.interactionState === 'EDITING_HANDLE' ||
      this.positionOverlay.getActiveDrag() !== null;

    if (interacting) {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }
  }

  /** Decide whether the engine consumes this pointerdown; when it does,
   *  the event is stopped so the chart never starts panning. */
  private handleContainerPointerDown(e: PointerEvent): void {
    const rawPos = this.getPosFromClient(e.clientX, e.clientY);

    // 0. Middle click (button 1): Delete drawing under pointer (TradingView shortcut)
    if (e.button === 1) {
      const hit = this.findDrawingAt(rawPos.x, rawPos.y);
      if (hit && !hit.locked) {
        e.preventDefault();
        e.stopPropagation();
        this.deleteDrawing(hit.id);
        return;
      }
      return;
    }

    if (e.button !== 0) return;

    const renderCtx: RenderContext = {
      ctx: this.ctx as CanvasRenderingContext2D,
      canvasWidth: this.canvas.width / (window.devicePixelRatio || 1),
      canvasHeight: this.canvas.height / (window.devicePixelRatio || 1),
      chartToPixel: (pt) => this.chartToPixel(pt),
      pixelToChart: (x, y) => this.pixelToChart(x, y),
    };

    // 1. Position overlay (close buttons / SL-TP drag handles)
    if (this.positionOverlay.handlePointerDown(rawPos.x, rawPos.y, renderCtx)) {
      if (this.positionOverlay.getActiveDrag()) {
        this.setChartScrollEnabled(false);
        try {
          this.container.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 2. Armed drawing tool -> always consume (chart must not pan while drawing)
    if (this.currentTool !== 'cursor') {
      e.preventDefault();
      e.stopPropagation();
      this.setChartScrollEnabled(false);
      this.onToolPointerDown(e, rawPos);
      return;
    }

    // 3. Quick Measure via Shift + Click when tool is cursor (TradingView shortcut)
    if (e.shiftKey && this.currentTool === 'cursor') {
      e.preventDefault();
      e.stopPropagation();
      this.setTool('measurement');
      this.onToolPointerDown(e, rawPos);
      return;
    }

    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // 4. Cursor mode interactions with drawings
    if (this.selectedDrawingId) {
      const selected = this.drawings.find((d) => d.id === this.selectedDrawingId);
      if (selected && !selected.locked && selected.visible !== false) {
        const handleIdx = this.hitTestHandles(selected, rawPos.x, rawPos.y);
        if (handleIdx >= 0) {
          e.preventDefault();
          e.stopPropagation();
          this.setChartScrollEnabled(false);
          this.interactionState = 'EDITING_HANDLE';
          this.activeHandleIndex = handleIdx;
          this.pointerDownPos = rawPos;
          this.pointerDragDist = 0;
          try {
            this.container.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          return;
        }

        if (this.hitTestDrawing(selected, rawPos.x, rawPos.y)) {
          e.preventDefault();
          e.stopPropagation();

          if (modKey) {
            // Ctrl/Cmd + Drag on selected drawing -> Clone it! (TradingView shortcut)
            const cloned = this.duplicateDrawing(selected.id);
            if (cloned) {
              this.setChartScrollEnabled(false);
              this.interactionState = 'CLONING';
              this.dragStartPos = rawPos;
              this.originalPoints = cloned.points.map((p) => ({ ...p }));
              this.pointerDownPos = rawPos;
              this.pointerDragDist = 0;
              this.originalMultiPoints.clear();
              this.originalMultiPoints.set(cloned.id, cloned.points.map((p) => ({ ...p })));
              try {
                this.container.setPointerCapture(e.pointerId);
              } catch {
                // ignore
              }
              return;
            }
          }

          this.setChartScrollEnabled(false);
          this.interactionState = 'MOVING';
          this.dragStartPos = rawPos;
          this.originalPoints = selected.points.map((p) => ({ ...p }));
          this.pointerDownPos = rawPos;
          this.pointerDragDist = 0;
          this.originalMultiPoints.clear();
          for (const id of this.selectedDrawingIds) {
            const d = this.drawings.find((item) => item.id === id);
            if (d && !d.locked) {
              this.originalMultiPoints.set(id, d.points.map((p) => ({ ...p })));
            }
          }
          if (!this.originalMultiPoints.has(selected.id)) {
            this.originalMultiPoints.set(selected.id, selected.points.map((p) => ({ ...p })));
          }
          try {
            this.container.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          return;
        }
      }
    }

    // 5. Selecting a different drawing
    const hit = this.findDrawingAt(rawPos.x, rawPos.y);
    if (hit) {
      e.preventDefault();
      e.stopPropagation();

      if (modKey) {
        // Multi-select toggle (TradingView shortcut)
        this.toggleDrawingSelection(hit.id);
        return;
      }

      this.selectDrawing(hit.id);
      if (!hit.locked && hit.visible !== false) {
        this.setChartScrollEnabled(false);
        this.interactionState = 'MOVING';
        this.dragStartPos = rawPos;
        this.originalPoints = hit.points.map((p) => ({ ...p }));
        this.pointerDownPos = rawPos;
        this.pointerDragDist = 0;
        this.originalMultiPoints.clear();
        this.originalMultiPoints.set(hit.id, hit.points.map((p) => ({ ...p })));
        try {
          this.container.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
      return;
    }

    // 6. Empty space -> let the chart pan; just clear selection.
    this.selectDrawing(null);
    this.setChartScrollEnabled(true);
  }

  private onToolPointerDown(e: PointerEvent, rawPos: { x: number; y: number }): void {
    this.isShiftPressed = e.shiftKey;
    this.lastPointerPos = rawPos;
    const pos = this.getEffectivePointerPos(rawPos, e.shiftKey);

    this.pointerDownPos = pos;
    this.pointerDragDist = 0;

    const chartPos = this.pixelToChart(pos.x, pos.y);
    if (!chartPos) return;

    if (this.interactionState === 'TOOL_SELECTED' || this.interactionState === 'DRAWING') {
      const reqCount = getRequiredPointCount(this.currentTool);

      if (reqCount === -1) {
        if (this.draftPoints.length === 0) {
          this.interactionState = 'DRAWING';
          this.draftPoints = [chartPos];
          try {
            this.container.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          this.redraw();
          return;
        }
      }

      if (reqCount === 1) {
        this.commitNewDrawing([chartPos]);
        return;
      }

      if (this.draftPoints.length === 0) {
        this.interactionState = 'DRAWING';
        this.draftPoints = [chartPos, { ...chartPos }];
        try {
          this.container.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        this.redraw();
        return;
      }

      if (reqCount === 2 && this.draftPoints.length === 2) {
        this.draftPoints[1] = chartPos;
        this.commitNewDrawing([...this.draftPoints]);
        return;
      }

      if (reqCount === 3 && this.draftPoints.length === 2) {
        this.draftPoints[1] = chartPos;
        this.draftPoints.push({ ...chartPos });
        this.redraw();
        return;
      }

      if (reqCount === 3 && this.draftPoints.length === 3) {
        this.draftPoints[2] = chartPos;
        this.commitNewDrawing([...this.draftPoints]);
        return;
      }
    }
  }

  /** Append a freehand point if distance from last point >= 2px */
  private appendFreehandPoint(pos: { x: number; y: number }): void {
    const chartPos = this.pixelToChart(pos.x, pos.y);
    if (!chartPos) return;

    if (this.draftPoints.length === 0) {
      this.draftPoints.push(chartPos);
      return;
    }

    const lastPt = this.draftPoints[this.draftPoints.length - 1];
    const lastPix = this.chartToPixel(lastPt);
    if (!lastPix || Math.hypot(pos.x - lastPix.x, pos.y - lastPix.y) >= 2) {
      this.draftPoints.push(chartPos);
    }
  }

  private handleContainerPointerMove(e: PointerEvent): void {
    const rawPos = this.getPosFromClient(e.clientX, e.clientY);
    const interacting =
      this.interactionState === 'DRAWING' ||
      this.interactionState === 'MOVING' ||
      this.interactionState === 'EDITING_HANDLE' ||
      this.positionOverlay.getActiveDrag() !== null;

    if (interacting) {
      e.preventDefault();
      e.stopPropagation();
    } else if (this.currentTool !== 'cursor') {
      if (e.buttons > 0) {
        e.preventDefault();
        e.stopPropagation();
      }
    } else if (e.buttons === 0) {
      // Pure hover in cursor mode: update cursor affordance only. No
      // pointerEvents toggling - hit-testing is done here directly.
      const target = this.isPointerOverInteractiveTarget(rawPos.x, rawPos.y);
      this.container.style.cursor = target.cursor;
      return;
    }

    // Coalesced sub-pixel pointer sampling for freehand tools (ADR 0001 - Domain 4B)
    if (
      this.interactionState === 'DRAWING' &&
      getRequiredPointCount(this.currentTool) === -1 &&
      typeof e.getCoalescedEvents === 'function'
    ) {
      const coalesced = e.getCoalescedEvents();
      if (coalesced && coalesced.length > 1) {
        for (let i = 0; i < coalesced.length - 1; i++) {
          const subPos = this.getPosFromClient(coalesced[i].clientX, coalesced[i].clientY);
          this.appendFreehandPoint(subPos);
        }
      }
    }

    this.onPointerMove(e, rawPos);
  }

  private onPointerEnter(e: PointerEvent): void {
    if (this.currentTool !== 'cursor') {
      this.crosshairPos = this.getCanvasPos(e);
      this.redraw();
    }
  }

  private onPointerLeave(): void {
    if (this.crosshairPos !== null) {
      this.crosshairPos = null;
      this.redraw();
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (handleDrawingKeyboardShortcut(e, this)) {
      return;
    }
  };

  private getCanvasPos(e: PointerEvent): { x: number; y: number } {
    return this.getPosFromClient(e.clientX, e.clientY);
  }

  private getPosFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  /** Abort any in-flight interaction (pointer cancellation, OS gestures). */
  cancelInteraction(): void {
    if (this.interactionState === 'CLONING' && this.selectedDrawingId) {
      const cloneId = this.selectedDrawingId;
      this.deleteDrawing(cloneId);
    }
    const wasDrawing = this.interactionState === 'DRAWING' && this.draftPoints.length > 0;
    this.draftPoints = [];
    this.dragStartPos = null;
    this.originalPoints = [];
    this.originalMultiPoints.clear();
    this.pointerDownPos = null;
    this.activeHandleIndex = -1;
    this.crosshairPos = null;
    if (this.interactionState !== 'IDLE') {
      if (this.currentTool !== 'cursor') {
        this.setTool('cursor');
      } else {
        this.interactionState = this.selectedDrawingId ? 'SELECTED' : 'IDLE';
      }
    }
    if (this.currentTool === 'cursor') {
      this.setChartScrollEnabled(true);
    }
    if (wasDrawing) {
      // A half-drawn ghost must not silently survive as a stale preview.
      this.redraw();
    }
  }

  private onPointerMove(e: PointerEvent, rawPosIn?: { x: number; y: number }): void {
    this.isShiftPressed = e.shiftKey;
    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    const rawPos = rawPosIn ?? this.getCanvasPos(e);
    this.lastPointerPos = rawPos;
    let pos = this.getEffectivePointerPos(rawPos, e.shiftKey, modKey);

    if (
      (this.interactionState === 'MOVING' || this.interactionState === 'CLONING') &&
      e.shiftKey &&
      this.dragStartPos &&
      this.originalPoints.length > 0
    ) {
      let dx = rawPos.x - this.dragStartPos.x;
      let dy = rawPos.y - this.dragStartPos.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        dy = 0;
      } else {
        dx = 0;
      }
      pos = { x: this.dragStartPos.x + dx, y: this.dragStartPos.y + dy };
    }

    if (this.pointerDownPos) {
      this.pointerDragDist += Math.hypot(
        pos.x - this.pointerDownPos.x,
        pos.y - this.pointerDownPos.y,
      );
    }

    const renderCtx: RenderContext = {
      ctx: this.ctx as CanvasRenderingContext2D,
      canvasWidth: this.canvas.width / (window.devicePixelRatio || 1),
      canvasHeight: this.canvas.height / (window.devicePixelRatio || 1),
      chartToPixel: (pt) => this.chartToPixel(pt),
      pixelToChart: (x, y) => this.pixelToChart(x, y),
    };

    const posMoveState = this.positionOverlay.handlePointerMove(pos.x, pos.y, renderCtx);
    if (posMoveState.isDragging) {
      this.container.style.cursor = posMoveState.cursor;
      this.redraw();
      return;
    }

    // Always track crosshair position for drawing tools
    if (this.currentTool !== 'cursor') {
      this.crosshairPos = pos;
    }

    // Update draft during drawing
    if (this.interactionState === 'DRAWING' && this.draftPoints.length > 0) {
      if (getRequiredPointCount(this.currentTool) === -1) {
        this.appendFreehandPoint(pos);
      } else {
        const chartPos = this.pixelToChart(pos.x, pos.y);
        if (chartPos) {
          this.draftPoints[this.draftPoints.length - 1] = chartPos;
        }
      }
      this.redraw();
      return;
    }

    // Move drawing
    if (
      (this.interactionState === 'MOVING' || this.interactionState === 'CLONING') &&
      this.selectedDrawingId &&
      this.dragStartPos &&
      this.originalPoints.length > 0
    ) {
      const selected = this.drawings.find((d) => d.id === this.selectedDrawingId);
      if (!selected || selected.locked) return;

      const p0 = this.chartToPixel(this.originalPoints[0]);
      if (!p0) return;

      const dx = pos.x - this.dragStartPos.x;
      const dy = pos.y - this.dragStartPos.y;

      const newP0Chart = this.pixelToChart(p0.x + dx, p0.y + dy);
      if (!newP0Chart) return;

      const dPrice = newP0Chart.price - this.originalPoints[0].price;
      const dTime = newP0Chart.timestamp - this.originalPoints[0].timestamp;

      if (this.originalMultiPoints.size > 1) {
        for (const [id, origPts] of this.originalMultiPoints.entries()) {
          const d = this.drawings.find((item) => item.id === id);
          if (!d || d.locked) continue;
          d.points = origPts.map((p) => ({
            timestamp: p.timestamp + dTime,
            price: p.price + dPrice,
          }));
        }
      } else {
        selected.points = this.originalPoints.map((p) => ({
          timestamp: p.timestamp + dTime,
          price: p.price + dPrice,
        }));
      }

      this.redraw();
      return;
    }

    // Drag handle
    if (
      this.interactionState === 'EDITING_HANDLE' &&
      this.selectedDrawingId &&
      this.activeHandleIndex >= 0
    ) {
      const selected = this.drawings.find((d) => d.id === this.selectedDrawingId);
      if (!selected || selected.locked) return;

      const chartPos = this.pixelToChart(pos.x, pos.y);
      if (!chartPos) return;

      if (selected.type === 'long_position' || selected.type === 'short_position') {
        const isLong = selected.type === 'long_position';
        const entryPrice = selected.points[0].price;
        const pipSize = getPipSize(entryPrice);
        const minGap = pipSize * 0.5;

        if (this.activeHandleIndex === 0) {
          // Entry Handle: moves entire position
          const dPrice = chartPos.price - selected.points[0].price;
          const dTime = chartPos.timestamp - selected.points[0].timestamp;
          selected.points[0] = { timestamp: chartPos.timestamp, price: chartPos.price };
          if (selected.points[1]) selected.points[1].price += dPrice;
          if (selected.points[2]) selected.points[2].price += dPrice;
          if (selected.points[3]) selected.points[3].timestamp += dTime;
        } else if (this.activeHandleIndex === 1) {
          // TP / Target Handle (drag limit enforced)
          if (!selected.points[1]) selected.points[1] = { ...selected.points[0] };
          if (isLong) {
            selected.points[1].price = Math.max(entryPrice + minGap, chartPos.price);
          } else {
            selected.points[1].price = Math.min(entryPrice - minGap, chartPos.price);
          }
        } else if (this.activeHandleIndex === 2) {
          // SL / Stop Handle (drag limit enforced)
          if (!selected.points[2]) selected.points[2] = { ...selected.points[0] };
          if (isLong) {
            selected.points[2].price = Math.min(entryPrice - minGap, chartPos.price);
          } else {
            selected.points[2].price = Math.max(entryPrice + minGap, chartPos.price);
          }
        } else if (this.activeHandleIndex === 3) {
          // Duration / Width Handle
          if (!selected.points[3]) selected.points[3] = { ...selected.points[0] };
          selected.points[3].timestamp = Math.max(
            selected.points[0].timestamp + 1,
            chartPos.timestamp,
          );
        } else if (this.activeHandleIndex === 4) {
          // Top-Right Corner Handle: TP & Duration
          if (!selected.points[1]) selected.points[1] = { ...selected.points[0] };
          if (isLong) {
            selected.points[1].price = Math.max(entryPrice + minGap, chartPos.price);
          } else {
            selected.points[1].price = Math.min(entryPrice - minGap, chartPos.price);
          }
          if (!selected.points[3]) selected.points[3] = { ...selected.points[0] };
          selected.points[3].timestamp = Math.max(
            selected.points[0].timestamp + 1,
            chartPos.timestamp,
          );
        } else if (this.activeHandleIndex === 5) {
          // Bottom-Right Corner Handle: SL & Duration
          if (!selected.points[2]) selected.points[2] = { ...selected.points[0] };
          if (isLong) {
            selected.points[2].price = Math.min(entryPrice - minGap, chartPos.price);
          } else {
            selected.points[2].price = Math.max(entryPrice + minGap, chartPos.price);
          }
          if (!selected.points[3]) selected.points[3] = { ...selected.points[0] };
          selected.points[3].timestamp = Math.max(
            selected.points[0].timestamp + 1,
            chartPos.timestamp,
          );
        }
      } else {
        selected.points[this.activeHandleIndex] = chartPos;
      }
      this.redraw();
      return;
    }

    // Redraw crosshair in TOOL_SELECTED state
    if (this.currentTool !== 'cursor' && this.interactionState === 'TOOL_SELECTED') {
      this.redraw();
      return;
    }

    // Hover routing in cursor mode (cursor affordance only - no
    // pointerEvents toggling; hit-testing is done on the container).
    if (this.currentTool === 'cursor') {
      const target = this.isPointerOverInteractiveTarget(pos.x, pos.y);
      this.container.style.cursor = posMoveState.cursor !== 'default' ? posMoveState.cursor : target.cursor;
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const wasInteracting =
      this.interactionState === 'DRAWING' ||
      this.interactionState === 'MOVING' ||
      this.interactionState === 'EDITING_HANDLE' ||
      this.positionOverlay.getActiveDrag() !== null;

    if (wasInteracting) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      this.container.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const modifyReq = this.positionOverlay.handlePointerUp();
    if (modifyReq) {
      this.redraw();
      if (this.onModifySlTpRequest) {
        this.onModifySlTpRequest(modifyReq);
      }
      if (this.currentTool === 'cursor') {
        this.setChartScrollEnabled(true);
      }
      return;
    }

    // Complete freehand stroke on pointer up
    if (
      this.interactionState === 'DRAWING' &&
      getRequiredPointCount(this.currentTool) === -1 &&
      this.draftPoints.length > 0
    ) {
      if (this.draftPoints.length === 1) {
        this.draftPoints.push({
          timestamp: this.draftPoints[0].timestamp + 1,
          price: this.draftPoints[0].price,
        });
      }
      this.commitNewDrawing([...this.draftPoints]);
      return;
    }

    // Complete drag-to-draw for 2-point tools if dragged significantly.
    // Use the Shift-constrained effective position so releasing with Shift
    // held keeps the angle the preview showed instead of snapping to raw
    // cursor coordinates.
    if (
      this.interactionState === 'DRAWING' &&
      this.draftPoints.length === 2 &&
      getRequiredPointCount(this.currentTool) === 2 &&
      this.pointerDragDist > 20
    ) {
      const rawPos = this.getCanvasPos(e);
      const effPos = this.getEffectivePointerPos(rawPos, e.shiftKey);
      const chartPos = this.pixelToChart(effPos.x, effPos.y);
      if (chartPos) {
        this.draftPoints[1] = chartPos;
        this.commitNewDrawing([...this.draftPoints]);
        return;
      }
    }

    if (
      this.interactionState === 'MOVING' ||
      this.interactionState === 'EDITING_HANDLE' ||
      this.interactionState === 'CLONING'
    ) {
      if (this.pointerDragDist > 3) {
        this.recordHistory();
        if (this.onSave) {
          if (this.originalMultiPoints.size > 0) {
            for (const id of this.originalMultiPoints.keys()) {
              const d = this.drawings.find((item) => item.id === id);
              if (d) this.onSave(d);
            }
          } else if (this.selectedDrawingId) {
            const d = this.drawings.find((item) => item.id === this.selectedDrawingId);
            if (d) this.onSave(d);
          }
        }
      }
      this.interactionState = this.selectedDrawingId ? 'SELECTED' : 'IDLE';
    }

    this.dragStartPos = null;
    this.originalPoints = [];
    this.originalMultiPoints.clear();
    this.pointerDownPos = null;
    this.activeHandleIndex = -1;

    if (this.currentTool === 'cursor') {
      this.setChartScrollEnabled(true);
      const pos = this.getCanvasPos(e);
      const target = this.isPointerOverInteractiveTarget(pos.x, pos.y);
      this.container.style.cursor = target.cursor;
    }
  }

  private commitNewDrawing(points: DrawingPoint[]): void {
    this.recordHistory();
    const isAnnotationText = this.currentTool === 'text' || this.currentTool === 'callout';
    const tfSec = getTimeframeSeconds(this.currentTimeframe);

    let committedPoints = points;
    if (this.currentTool === 'long_position' || this.currentTool === 'short_position') {
      const entryPoint = points[0];
      const entryPrice = entryPoint.price;
      const isLong = this.currentTool === 'long_position';
      const defaultDelta = entryPrice > 50 ? 0.4 : 0.004;

      let tpPrice = points[1]?.price;
      if (!tpPrice || Math.abs(tpPrice - entryPrice) < defaultDelta / 10) {
        tpPrice = isLong ? entryPrice + defaultDelta : entryPrice - defaultDelta;
      }
      const slPrice = isLong
        ? entryPrice - Math.abs(tpPrice - entryPrice) / 2
        : entryPrice + Math.abs(entryPrice - tpPrice) / 2;

      const endTimestamp =
        points[1]?.timestamp && points[1].timestamp > entryPoint.timestamp
          ? points[1].timestamp
          : entryPoint.timestamp + tfSec * 20;

      committedPoints = [
        { timestamp: entryPoint.timestamp, price: entryPrice },
        { timestamp: entryPoint.timestamp, price: tpPrice },
        { timestamp: entryPoint.timestamp, price: slPrice },
        { timestamp: endTimestamp, price: entryPrice },
      ];
    }

    const isPositionTool = this.currentTool === 'long_position' || this.currentTool === 'short_position';
    const defaultStyle = this.getToolDefaultStyle(this.currentTool);

    const newDrawing: DrawingDefinition = {
      id: `draw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      symbol: this.currentSymbol,
      timeframe: this.currentTimeframe,
      type: this.currentTool,
      points: committedPoints,
      style: {
        ...defaultStyle,
        text: isAnnotationText
          ? this.currentTool === 'callout'
            ? 'Callout Note'
            : 'Text Note'
          : undefined,
        accountSize: isPositionTool ? (defaultStyle.accountSize || 10000) : undefined,
        riskPercent: isPositionTool ? (defaultStyle.riskPercent || 1.0) : undefined,
        riskAmount: isPositionTool ? (defaultStyle.riskAmount || 100) : undefined,
        riskMode: isPositionTool ? (defaultStyle.riskMode || 'PERCENT') : undefined,
        targetColor: isPositionTool ? (defaultStyle.targetColor || '#089981') : undefined,
        stopColor: isPositionTool ? (defaultStyle.stopColor || '#f23645') : undefined,
        compactStats: defaultStyle.compactStats ?? false,
        lotSize: defaultStyle.lotSize || 1.0,
      },
      locked: false,
      visible: true,
    };

    this.drawings.push(newDrawing);
    this.draftPoints = [];

    const isFreehand =
      this.currentTool === 'brush' ||
      this.currentTool === 'pencil' ||
      this.currentTool === 'pen';

    if (isFreehand) {
      // Keep brush/pencil/pen tool selected for continuous drawing until user switches tools
      this.interactionState = 'TOOL_SELECTED';
      this.container.style.cursor = 'crosshair';
      this.redraw();
    } else {
      this.setTool('cursor');
      this.selectDrawing(newDrawing.id);
    }

    if (this.onSave) this.onSave(newDrawing);
  }

  // -- Hit Testing --------------------------------------------------

  findDrawingAt(px: number, py: number): DrawingDefinition | null {
    if (this.isHiddenAllDrawings) return null;
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      if (d.visible && this.hitTestDrawing(d, px, py)) {
        return d;
      }
    }
    return null;
  }

  private hitTestDrawing(d: DrawingDefinition, px: number, py: number): boolean {
    if (d.points.length === 0) return false;
    const pixels = d.points
      .map((p) => this.chartToPixel(p))
      .filter(Boolean) as { x: number; y: number }[];
    if (pixels.length === 0) return false;

    const [p1, p2, p3] = pixels;

    if (d.type === 'horizontal_line') {
      return Math.abs(py - p1.y) <= 8;
    }
    if (d.type === 'vertical_line') {
      return Math.abs(px - p1.x) <= 8;
    }
    if (d.type === 'price_label') {
      return isPointInRect(px, py, p1.x, p1.y - 12, p1.x + 80, p1.y + 12);
    }
    if (d.type === 'date_label') {
      return isPointInRect(px, py, p1.x - 60, p1.y - 26, p1.x + 60, p1.y);
    }
    if (d.type === 'text') {
      return isPointInRect(px, py, p1.x - 4, p1.y - 16, p1.x + 100, p1.y + 8);
    }

    if (d.type === 'long_position' || d.type === 'short_position') {
      const entryP = p1;
      const endTimestamp =
        d.points[3]?.timestamp ?? (d.points[0].timestamp + 3600 * 20);
      const endPix = this.chartToPixel({ timestamp: endTimestamp, price: d.points[0].price });
      const leftX = entryP.x;
      const rightX = Math.max(leftX + 5, endPix?.x ?? (leftX + 30));

      const tpP = d.points[1] ? this.chartToPixel(d.points[1]) : null;
      const slP = d.points[2] ? this.chartToPixel(d.points[2]) : null;
      const tpY = tpP?.y ?? entryP.y - 60;
      const slY = slP?.y ?? entryP.y + 30;

      const minY = Math.min(entryP.y, tpY, slY) - 20;
      const maxY = Math.max(entryP.y, tpY, slY) + 20;
      return px >= leftX && px <= rightX && py >= minY && py <= maxY;
    }

    if (d.type === 'brush' || d.type === 'pencil' || d.type === 'pen') {
      const threshold = Math.max(8, (d.style.width || 4) / 2 + 4);
      if (pixels.length === 1) {
        return distanceToPoint(px, py, pixels[0].x, pixels[0].y) <= threshold;
      }
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < pixels.length; i++) {
        const x = pixels[i].x;
        const y = pixels[i].y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (px < minX - threshold || px > maxX + threshold || py < minY - threshold || py > maxY + threshold) {
        return false;
      }
      for (let i = 0; i < pixels.length - 1; i++) {
        if (
          distanceToSegment(px, py, pixels[i].x, pixels[i].y, pixels[i + 1].x, pixels[i + 1].y) <=
          threshold
        ) {
          return true;
        }
      }
      return false;
    }

    if (!p2) return false;

    if (d.type === 'trend_line' || d.type === 'arrow') {
      const minX = Math.min(p1.x, p2.x) - 8;
      const maxX = Math.max(p1.x, p2.x) + 8;
      const minY = Math.min(p1.y, p2.y) - 8;
      const maxY = Math.max(p1.y, p2.y) + 8;
      if (px < minX || px > maxX || py < minY || py > maxY) return false;
      return distanceToSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= 8;
    }
    if (d.type === 'extended_line') {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return distanceToPoint(px, py, p1.x, p1.y) <= 8;
      return Math.abs(dy * px - dx * py + p2.x * p1.y - p2.y * p1.x) / len <= 8;
    }
    if (d.type === 'ray') {
      return distanceToRay(px, py, p1.x, p1.y, p2.x, p2.y) <= 8;
    }
    if (
      d.type === 'rectangle' ||
      d.type === 'price_range' ||
      d.type === 'measurement' ||
      d.type === 'gann_box'
    ) {
      return isPointInRect(px, py, p1.x, p1.y, p2.x, p2.y);
    }
    if (d.type === 'ellipse') {
      return isPointInEllipse(px, py, p1.x, p1.y, p2.x, p2.y);
    }
    if (d.type === 'circle') {
      const r = distanceToPoint(p1.x, p1.y, p2.x, p2.y);
      return distanceToPoint(px, py, p1.x, p1.y) <= r + 6;
    }
    if (d.type === 'date_range' || d.type === 'bars_count') {
      return (
        Math.abs(py - p1.y) <= 24 &&
        px >= Math.min(p1.x, p2.x) - 6 &&
        px <= Math.max(p1.x, p2.x) + 6
      );
    }
    if (d.type === 'callout') {
      const bubbleHit = isPointInRect(px, py, p2.x - 65, p2.y - 20, p2.x + 65, p2.y + 20);
      const pointerHit = distanceToSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= 8;
      return bubbleHit || pointerHit;
    }
    if (d.type === 'fib_retracement') {
      const minX = Math.min(p1.x, p2.x);
      // Match the render extent (minX + 160) so the hit box covers the
      // level labels instead of cutting them off.
      const maxX = Math.max(p1.x, p2.x, minX + 160);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      return px >= minX - 6 && px <= maxX + 6 && py >= minY - 6 && py <= maxY + 6;
    }
    if (d.type === 'fib_timezones') {
      return Math.abs(px - p1.x) <= 8 || Math.abs(px - p2.x) <= 8;
    }
    if (d.type === 'gann_fan') {
      // Hit-test EVERY drawn ray, not just the base ray: 8 of the 9 rays
      // were previously unreachable by click.
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      for (const ray of GANN_FAN_RATIOS) {
        const targetY = p1.y + dy * ray.ratio;
        const targetX = p1.x + dx;
        if (distanceToRay(px, py, p1.x, p1.y, targetX, targetY) <= 12) {
          return true;
        }
      }
      return false;
    }
    if (d.type === 'regression_channel') {
      // Match the rendered band half-height instead of a fixed tolerance,
      // which made wide channels unhittable on their bands and narrow ones
      // selectable in empty space.
      if (!p2) return false;
      const channelHeight = Math.abs(p2.y - p1.y) * 0.4 + 30;
      const minX = Math.min(p1.x, p2.x) - channelHeight;
      const maxX = Math.max(p1.x, p2.x) + channelHeight;
      const minY = Math.min(p1.y, p2.y) - channelHeight;
      const maxY = Math.max(p1.y, p2.y) + channelHeight;
      if (px < minX || px > maxX || py < minY || py > maxY) return false;

      const len = distanceToPoint(p1.x, p1.y, p2.x, p2.y);
      if (len < 1) {
        return distanceToPoint(px, py, p1.x, p1.y) <= channelHeight;
      }
      // Distance from point to the center line segment
      let t = ((px - p1.x) * (p2.x - p1.x) + (py - p1.y) * (p2.y - p1.y)) / (len * len);
      t = Math.max(0, Math.min(1, t));
      const cx = p1.x + t * (p2.x - p1.x);
      const cy = p1.y + t * (p2.y - p1.y);
      return distanceToPoint(px, py, cx, cy) <= channelHeight;
    }

    if (p3) {
      if (d.type === 'triangle') {
        const minX = Math.min(p1.x, p2.x, p3.x) - 8;
        const maxX = Math.max(p1.x, p2.x, p3.x) + 8;
        const minY = Math.min(p1.y, p2.y, p3.y) - 8;
        const maxY = Math.max(p1.y, p2.y, p3.y) + 8;
        if (px < minX || px > maxX || py < minY || py > maxY) return false;

        return (
          isPointInPolygon(px, py, [p1, p2, p3]) ||
          distanceToSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= 8 ||
          distanceToSegment(px, py, p2.x, p2.y, p3.x, p3.y) <= 8 ||
          distanceToSegment(px, py, p3.x, p3.y, p1.x, p1.y) <= 8
        );
      }
      if (
        d.type === 'parallel_channel' ||
        d.type === 'equidistant_channel' ||
        d.type === 'fib_channel'
      ) {
        const geo = calculateParallelChannel(p1, p2, p3);
        return isPointInPolygon(px, py, [geo.p1, geo.p2, geo.p4, geo.p3]);
      }
      if (
        d.type === 'pitchfork' ||
        d.type === 'schiff_pitchfork' ||
        d.type === 'modified_schiff_pitchfork'
      ) {
        const variant =
          d.type === 'schiff_pitchfork'
            ? 'schiff'
            : d.type === 'modified_schiff_pitchfork'
              ? 'modified_schiff'
              : 'standard';
        const geo = calculatePitchfork(p1, p2, p3, variant);
        const medianHit =
          distanceToRay(px, py, geo.origin.x, geo.origin.y, geo.medianEnd.x, geo.medianEnd.y) <= 8;
        const upperHit = distanceToRay(px, py, p2.x, p2.y, geo.upperEnd.x, geo.upperEnd.y) <= 8;
        const lowerHit = distanceToRay(px, py, p3.x, p3.y, geo.lowerEnd.x, geo.lowerEnd.y) <= 8;
        return medianHit || upperHit || lowerHit;
      }
      if (d.type === 'fib_extension' || d.type === 'fib_projection') {
        const minX = Math.min(p1.x, p2.x, p3.x) - 8;
        const maxX = Math.max(p1.x, p2.x, p3.x) + 8;
        const minY = Math.min(p1.y, p2.y, p3.y) - 8;
        const maxY = Math.max(p1.y, p2.y, p3.y) + 8;
        if (px < minX || px > maxX || py < minY || py > maxY) return false;

        return (
          distanceToSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= 8 ||
          distanceToSegment(px, py, p2.x, p2.y, p3.x, p3.y) <= 8
        );
      }
    }

    return false;
  }

  private hitTestHandles(d: DrawingDefinition, px: number, py: number): number {
    if (d.type === 'long_position' || d.type === 'short_position') {
      const p1 = this.chartToPixel(d.points[0]);
      if (!p1) return -1;

      const metrics = calculatePositionMetrics(d.type, d.points, d.style);
      const { leftX, rightX, midX, tpY, slY } = calculatePositionHandleCoords(
        p1,
        metrics,
        (pt) => this.chartToPixel(pt),
        d.points[0].timestamp,
      );

      // Handle 0: Entry Anchor (left edge center)
      if (distanceToPoint(px, py, leftX, p1.y) <= 10) return 0;
      // Handle 1: TP / Target (mid top)
      if (distanceToPoint(px, py, midX, tpY) <= 10) return 1;
      // Handle 2: SL / Stop (mid bottom)
      if (distanceToPoint(px, py, midX, slY) <= 10) return 2;
      // Handle 3: Duration / Width (right edge center)
      if (distanceToPoint(px, py, rightX, p1.y) <= 10) return 3;
      // Handle 4: Top Right Corner
      if (distanceToPoint(px, py, rightX, tpY) <= 10) return 4;
      // Handle 5: Bottom Right Corner
      if (distanceToPoint(px, py, rightX, slY) <= 10) return 5;

      return -1;
    }

    if (d.type === 'brush' || d.type === 'pencil' || d.type === 'pen') {
      const handleIndices = [0, Math.floor((d.points.length - 1) / 2), d.points.length - 1];
      for (const idx of handleIndices) {
        if (d.points[idx]) {
          const p = this.chartToPixel(d.points[idx]);
          if (p && distanceToPoint(px, py, p.x, p.y) <= 8) {
            return idx;
          }
        }
      }
      return -1;
    }

    for (let i = 0; i < d.points.length; i++) {
      const p = this.chartToPixel(d.points[i]);
      if (p && distanceToPoint(px, py, p.x, p.y) <= 8) {
        return i;
      }
    }
    return -1;
  }

  // -- Rendering ----------------------------------------------------

  /**
   * Schedule a redraw on the next animation frame.
   * Coalesces high-frequency mouse moves, candle ticks, and state changes
   * into a single smooth 60fps/144fps screen refresh, eliminating CPU/GPU thrashing.
   */
  redraw(): void {
    if (typeof requestAnimationFrame !== 'function') {
      this.redrawImmediate();
      return;
    }
    if (this.redrawRafId !== null) return;
    this.redrawRafId = requestAnimationFrame(() => {
      this.redrawRafId = null;
      this.redrawImmediate();
    });
  }

  /** Force immediate synchronous redraw when required. */
  redrawImmediate(): void {
    if (this.redrawRafId !== null) {
      cancelAnimationFrame(this.redrawRafId);
      this.redrawRafId = null;
    }
    if (!this.ctx) return; // headless/test environments without 2d context
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    this.ctx.clearRect(0, 0, w, h);

    const rc: RenderContext = {
      ctx: this.ctx as CanvasRenderingContext2D,
      canvasWidth: w,
      canvasHeight: h,
      chartToPixel: (pt: DrawingPoint) => this.chartToPixel(pt),
      pixelToChart: (x: number, y: number) => this.pixelToChart(x, y),
      getBarStats: (t1, t2, p1, p2) => this.getBarStats(t1, t2, p1, p2),
    };

    // 1. Render committed drawings
    if (!this.isHiddenAllDrawings) {
      for (const d of this.drawings) {
        if (d.visible) {
          const isSelected =
            this.selectedDrawingIds.has(d.id) || d.id === this.selectedDrawingId;
          renderDrawingOnCanvas(d, isSelected, rc);
        }
      }
    }

    // 2. Render active trade positions, live PnL line, SL/TP and lot size
    this.positionOverlay.render(rc);

    // 3. Render active draft
    if (this.interactionState === 'DRAWING' && this.draftPoints.length > 0) {
      const draftDef: DrawingDefinition = {
        id: 'draft',
        symbol: this.currentSymbol,
        timeframe: this.currentTimeframe,
        type: this.currentTool,
        points: this.draftPoints,
        style: this.getToolDefaultStyle(this.currentTool),
        locked: false,
        visible: true,
      };
      renderDrawingOnCanvas(draftDef, false, rc);
    }

    // 4. Render full-canvas crosshair extending vertically & horizontally for all drawing tools
    if (this.currentTool !== 'cursor' && this.crosshairPos) {
      renderFullCrosshair(this.crosshairPos, this.currentSymbol, this.currentTimeframe, rc);
    }
  }

  destroy(): void {
    if (this.redrawRafId !== null) {
      cancelAnimationFrame(this.redrawRafId);
      this.redrawRafId = null;
    }
    window.removeEventListener('keydown', this.onWindowKeyDownShift);
    window.removeEventListener('keyup', this.onWindowKeyUpShift);
    this.container.removeEventListener('pointerdown', this.onContainerPointerDown, true);
    this.container.removeEventListener('pointermove', this.onContainerPointerMove, true);
    this.container.removeEventListener('pointerup', this.onContainerPointerUp, true);
    this.container.removeEventListener('pointercancel', this.onContainerPointerCancel, true);
    this.container.removeEventListener('pointerenter', this.onContainerPointerEnter, true);
    this.container.removeEventListener('pointerleave', this.onContainerPointerLeave, true);
    this.container.removeEventListener('dblclick', this.onContainerDblClick, true);
    this.container.removeEventListener('wheel', this.onWheelCapture, { capture: true });
    this.container.removeEventListener('mousedown', this.onContainerMouseDown, true);
    this.container.removeEventListener('mousemove', this.onContainerMouseMove, true);
    this.container.removeEventListener('mouseup', this.onContainerMouseUp, true);
    this.container.removeEventListener('touchstart', this.onContainerTouchStart, { capture: true });
    this.container.removeEventListener('touchmove', this.onContainerTouchMove, { capture: true });
    this.setChartScrollEnabled(true);
    for (const unsub of this.unsubscribeFns) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    this.unsubscribeFns = [];
    this.canvas.remove();
  }
}
