import { describe, expect, it, vi } from 'vitest';
import { OrderPanel } from '../../frontend/src/ui/order-panel';
import { TradingDrawer } from '../../frontend/src/ui/trading-drawer';
import { PositionOverlay } from '../../frontend/src/chart/position-overlay';
import type { PositionDefinition } from '../../frontend/src/trading/trading-types';

if (typeof globalThis.document === 'undefined') {
  const dummyEl = () => ({
    className: '',
    id: '',
    style: {},
    appendChild: () => {},
    querySelectorAll: () => [],
    querySelector: () => ({ addEventListener: () => {} }),
    addEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
  });
  (globalThis as any).document = {
    createElement: dummyEl,
  };
}

function createMockParent() {
  const children: any[] = [];
  return {
    children,
    innerHTML: '',
    appendChild: (child: any) => children.push(child),
    querySelector: () => ({ addEventListener: () => {} }),
  } as any;
}

describe('Wave 9 Trading UI Components', () => {
  it('instantiates OrderPanel and updates active symbol', () => {
    const parent = createMockParent();
    const panel = new OrderPanel(parent, null);
    panel.setSymbol('GBPUSD');
    // Successfully instantiated without throwing
    expect(panel).toBeDefined();
  });

  it('instantiates TradingDrawer and handles refresh', async () => {
    const parent = createMockParent();
    const drawer = new TradingDrawer(parent, null);
    await drawer.refresh();
    expect(drawer).toBeDefined();
  });

  it('renders active positions, PnL line, SL/TP and lot sizes in PositionOverlay', () => {
    const closeSpy = vi.fn();
    const overlay = new PositionOverlay(closeSpy);
    overlay.setSymbol('EURUSD');

    const mockPositions: PositionDefinition[] = [
      {
        position_id: 'pos_123',
        symbol: 'EURUSD',
        side: 'LONG',
        quantity: 1.5,
        lot_size: 1.5,
        entry_price: 1.0850,
        current_price: 1.0900,
        unrealized_pnl: 75.0,
        pips: 50.0,
        realized_pnl: 0,
        stop_loss: 1.0800,
        take_profit: 1.0950,
        opened_at: 1700000000,
        status: 'OPEN',
      },
    ];

    overlay.setPositions(mockPositions);
    expect(overlay.getPositions()).toHaveLength(1);

    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      setLineDash: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
    } as any;

    const rc = {
      ctx: mockCtx,
      canvasWidth: 800,
      canvasHeight: 500,
      chartToPixel: (_pt: any) => ({ x: 200, y: 150 }),
      pixelToChart: (_x: number, _y: number) => ({ timestamp: 1700000000, price: 1.0850 }),
    };

    overlay.render(rc);
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();

    // Verify close button hit test triggers callback
    const handled = overlay.handlePointerDown(345, 145);
    expect(handled).toBe(true);
    expect(closeSpy).toHaveBeenCalledWith('pos_123', expect.any(Number));
  });
});
