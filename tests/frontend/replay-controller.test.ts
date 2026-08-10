import { describe, expect, it, vi } from 'vitest';
import { ReplayController, type ReplayState } from '../../frontend/src/replay/replay-controller';

describe('ReplayController', () => {
  it('manages replay state and bridge commands', async () => {
    const mockState: ReplayState = {
      symbol: 'BTCUSDT',
      timeframe: '1H',
      status: 'PAUSED',
      current_index: 10,
      start_index: 10,
      end_index: 50,
      warmup_candles: 10,
      speed: 1.0,
      current_timestamp: 1700000000,
      total_candles: 51,
      visible_count: 11,
    };

    const listeners = new Map<string, (payload: unknown) => void>();

    const mockBridge = {
      callJson: vi.fn().mockImplementation((cmd: string) => {
        if (cmd === 'createReplay') {
          return Promise.resolve({
            ok: true,
            data: {
              state: mockState,
              candles: [[1700000000, 100, 105, 99, 104, 1000]],
            },
          });
        }
        if (cmd === 'playReplay') {
          return Promise.resolve({
            ok: true,
            data: { ...mockState, status: 'PLAYING' },
          });
        }
        if (cmd === 'replayNext') {
          return Promise.resolve({
            ok: true,
            data: {
              state: { ...mockState, current_index: 11 },
              candles: [[1700003600, 104, 106, 102, 105, 1200]],
            },
          });
        }
        return Promise.resolve({ ok: true, data: mockState });
      }),
      onEvent: vi.fn().mockImplementation((event: string, cb: (payload: unknown) => void) => {
        listeners.set(event, cb);
        return () => listeners.delete(event);
      }),
    };

    const mockChart = {
      loadHistory: vi.fn(),
      appendCandle: vi.fn(),
    };

    let latestState: ReplayState | null = null;
    const controller = new ReplayController(
      mockBridge as any,
      mockChart as any,
      (s) => {
        latestState = s;
      },
    );

    // Test createReplay
    await controller.createReplay('BTCUSDT', '1H', 10, 1.0);
    expect(mockBridge.callJson).toHaveBeenCalledWith('createReplay', {
      symbol: 'BTCUSDT',
      timeframe: '1H',
      warmup_candles: 10,
      speed: 1.0,
    });
    expect(mockChart.loadHistory).toHaveBeenCalled();
    expect((latestState as ReplayState | null)?.status).toBe('PAUSED');

    // Test play
    await controller.play();
    expect((latestState as ReplayState | null)?.status).toBe('PLAYING');

    // Test stepForward
    await controller.stepForward(1);
    expect(mockChart.appendCandle).toHaveBeenCalled();
    expect((latestState as ReplayState | null)?.current_index).toBe(11);
  });
});
