import { describe, expect, it, vi } from 'vitest';
import { IndicatorManager } from '../../frontend/src/indicators/indicator-manager';
import type { ActiveIndicator } from '../../frontend/src/indicators/indicator-types';

describe('IndicatorManager', () => {
  it('loads catalog, adds indicator, and manages lifecycle', async () => {
    const mockCatalog = [
      {
        name: 'sma',
        display_name: 'Simple Moving Average',
        category: 'trend',
        overlay: true,
        default_params: { period: 14 },
        param_schema: {},
      },
      {
        name: 'rsi',
        display_name: 'Relative Strength Index',
        category: 'momentum',
        overlay: false,
        default_params: { period: 14 },
        param_schema: {},
      },
    ];

    const mockBridge = {
      callJson: vi.fn().mockImplementation((cmd: string, args: any) => {
        if (cmd === 'getIndicatorCatalog') {
          return Promise.resolve({ ok: true, data: mockCatalog });
        }
        if (cmd === 'calculateIndicator') {
          return Promise.resolve({
            ok: true,
            data: {
              name: args.indicator_name,
              display_name: 'Test',
              overlay: true,
              category: 'trend',
              timestamps: [1700000000, 1700003600],
              lines: { value: [100.0, 101.5] },
            },
          });
        }
        return Promise.resolve({ ok: true });
      }),
    };

    const mockChart = {
      addIndicatorLineSeries: vi.fn(),
      setIndicatorLineData: vi.fn(),
      removeIndicatorSeries: vi.fn(),
    };

    let activeList: ActiveIndicator[] = [];
    const manager = new IndicatorManager(
      mockBridge as any,
      mockChart as any,
      (active) => {
        activeList = active;
      },
    );

    // 1. Init catalog
    await manager.init();
    expect(manager.getCatalog()).toHaveLength(2);

    // 2. Set context
    manager.setContext('BTCUSDT', '1H');

    // 3. Add indicator
    await manager.addIndicator('sma', { period: 20 });
    expect(activeList).toHaveLength(1);
    expect(activeList[0].name).toBe('sma');
    expect(activeList[0].params.period).toBe(20);
    expect(mockChart.addIndicatorLineSeries).toHaveBeenCalled();
    expect(mockChart.setIndicatorLineData).toHaveBeenCalled();

    // 4. Toggle visibility
    const id = activeList[0].id;
    await manager.toggleVisibility(id);
    expect(activeList[0].visible).toBe(false);
    expect(mockChart.removeIndicatorSeries).toHaveBeenCalled();

    // 5. Remove indicator
    manager.removeIndicator(id);
    expect(activeList).toHaveLength(0);
  });
});
