import { describe, expect, it, vi } from 'vitest';
import { DrawingEngine } from '../../frontend/src/drawings/drawing-engine';
import type { DrawingDefinition } from '../../frontend/src/drawings/drawing-types';

describe('DrawingEngine (Wave 6 Advanced)', () => {
  it('manages advanced drawings, multi-point tools, styling, locks, and visibility', () => {
    const mockCtx = {
      clearRect: vi.fn(),
      setTransform: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      fillText: vi.fn(),
      closePath: vi.fn(),
      roundRect: vi.fn(),
      setLineDash: vi.fn(),
    };

    const mockCanvas = {
      style: {},
      getContext: () => mockCtx,
      addEventListener: vi.fn(),
      remove: vi.fn(),
      width: 800,
      height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }),
    };

    const mockContainer = {
      style: {},
      clientWidth: 800,
      clientHeight: 500,
      appendChild: vi.fn(),
    };

    if (typeof (globalThis as any).document === 'undefined') {
      (globalThis as any).document = {
        createElement: (tag: string) => {
          if (tag === 'canvas') return mockCanvas;
          return { style: {}, addEventListener: vi.fn(), appendChild: vi.fn() };
        },
      };
    }
    if (typeof (globalThis as any).window === 'undefined') {
      (globalThis as any).window = {
        addEventListener: vi.fn(),
        devicePixelRatio: 1,
      };
    }

    const container = mockContainer as any;

    const mockTimeScale = {
      timeToCoordinate: vi.fn().mockImplementation((t: number) => (t - 1700000000) / 10),
      coordinateToTime: vi.fn().mockImplementation((x: number) => 1700000000 + x * 10),
      subscribeVisibleLogicalRangeChange: vi.fn(),
    };

    const mockSeries = {
      priceToCoordinate: vi.fn().mockImplementation((p: number) => 500 - (p - 100) * 10),
      coordinateToPrice: vi.fn().mockImplementation((y: number) => 100 + (500 - y) / 10),
    };

    const mockChart = {
      timeScale: () => mockTimeScale,
    };

    const saved: DrawingDefinition[] = [];
    const deleted: string[] = [];
    let selectedItem: DrawingDefinition | null = null;

    const engine = new DrawingEngine(
      container,
      mockChart as any,
      mockSeries as any,
      (d) => saved.push(d),
      (id) => deleted.push(id),
      (sel) => { selectedItem = sel; },
    );

    engine.setContext('EURUSD', '1H');

    // 1. Tool switching
    engine.setTool('fib_retracement');
    expect(engine.getCurrentTool()).toBe('fib_retracement');

    // 2. Coordinate conversion
    const pixel = engine.chartToPixel({ timestamp: 1700000100, price: 120 });
    expect(pixel).toEqual({ x: 10, y: 300 });

    const chartPos = engine.pixelToChart(10, 300);
    expect(chartPos).toEqual({ timestamp: 1700000100, price: 120 });

    // 3. Set advanced drawings
    const fibDrawing: DrawingDefinition = {
      id: 'fib-1',
      symbol: 'EURUSD',
      timeframe: '1H',
      type: 'fib_retracement',
      points: [
        { timestamp: 1700000000, price: 1.08 },
        { timestamp: 1700000500, price: 1.12 },
      ],
      style: { color: '#ff9800', width: 2, lineStyle: 'solid' },
      locked: false,
      visible: true,
    };

    const pitchforkDrawing: DrawingDefinition = {
      id: 'pf-1',
      symbol: 'EURUSD',
      timeframe: '1H',
      type: 'pitchfork',
      points: [
        { timestamp: 1700000000, price: 1.08 },
        { timestamp: 1700000300, price: 1.12 },
        { timestamp: 1700000600, price: 1.09 },
      ],
      style: { color: '#2962ff', width: 2 },
      locked: false,
      visible: true,
    };

    engine.setDrawings([fibDrawing, pitchforkDrawing]);
    expect(engine.getDrawings()).toHaveLength(2);

    // 4. Selection & Style Editing
    engine.selectDrawing('fib-1');
    expect(selectedItem).not.toBeNull();
    expect(engine.getSelectedDrawing()?.id).toBe('fib-1');

    engine.updateDrawingStyle('fib-1', { color: '#089981', width: 3, lineStyle: 'dashed' });
    expect(engine.getSelectedDrawing()?.style.color).toBe('#089981');
    expect(engine.getSelectedDrawing()?.style.width).toBe(3);
    expect(engine.getSelectedDrawing()?.style.lineStyle).toBe('dashed');

    // 5. Lock and Visibility toggles
    engine.toggleLock('fib-1');
    expect(engine.getSelectedDrawing()?.locked).toBe(true);

    engine.toggleVisibility('fib-1');
    expect(engine.getSelectedDrawing()?.visible).toBe(false);

    engine.setAllVisibility(true);
    expect(engine.getDrawings().every((d) => d.visible)).toBe(true);

    // 6. Duplication
    const duplicated = engine.duplicateDrawing('pf-1');
    expect(duplicated).not.toBeNull();
    expect(engine.getDrawings()).toHaveLength(3);

    // 7. Deletion
    engine.deleteDrawing('fib-1');
    expect(engine.getDrawings()).toHaveLength(2);
    expect(deleted).toContain('fib-1');

    // 8. Candle data & Measurement bar stats
    engine.setCandleData([
      [1700000000, 1.08, 1.09, 1.075, 1.085, 1500],
      [1700003600, 1.085, 1.095, 1.082, 1.09, 2000],
      [1700007200, 1.09, 1.10, 1.088, 1.098, 2500],
      [1700010800, 1.098, 1.105, 1.095, 1.102, 3000],
    ]);

    const stats = engine.getBarStats(1700000000, 1700010800, 1.08, 1.102);
    expect(stats.barsCount).toBe(4);
    expect(stats.volume).toBe(9000); // 1500 + 2000 + 2500 + 3000
    expect(stats.durationSec).toBe(10800);

    // 9. Long Position dynamic tool points
    const longPos: DrawingDefinition = {
      id: 'long-1',
      symbol: 'EURUSD',
      timeframe: '1H',
      type: 'long_position',
      points: [
        { timestamp: 1700000000, price: 1.085 }, // Entry
        { timestamp: 1700000000, price: 1.105 }, // TP
        { timestamp: 1700000000, price: 1.075 }, // SL
        { timestamp: 1700010800, price: 1.085 }, // Extent
      ],
      style: { color: '#2962ff', width: 2 },
      locked: false,
      visible: true,
    };
    engine.setDrawings([longPos]);
    expect(engine.getDrawings()).toHaveLength(1);
    expect(engine.getDrawings()[0].points).toHaveLength(4);

    // 10. Clear all
    engine.clearAll();
    expect(engine.getDrawings()).toHaveLength(0);
  });
});
