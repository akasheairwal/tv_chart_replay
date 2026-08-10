/**
 * Unit tests for SessionManager and SessionDialog.
 */
import { describe, expect, it, vi } from 'vitest';

describe('SessionManager (browser stub)', () => {
  it('collectCurrentState returns a well-formed SessionDefinition', async () => {
    const { SessionManager } = await import('../../frontend/src/sessions/session-manager');

    const sm = new SessionManager(null);

    const mockReplayController = {
      state: { start_index: 0, current_index: 42, end_index: 200, speed: 2.0, is_playing: false },
      togglePlayPause: vi.fn(),
      stepForward: vi.fn(),
      stepBackward: vi.fn(),
      reset: vi.fn(),
      jumpTo: vi.fn(),
      createReplay: vi.fn(),
      createRandomReplay: vi.fn(),
    };

    const mockIndicatorManager = {
      getActive: () => [
        { id: 'sma1', name: 'SMA', params: { period: 20 }, colors: { default: '#fff' }, visible: true },
      ],
      recalculateAll: vi.fn(),
      setContext: vi.fn(),
      init: vi.fn(),
      updateActive: vi.fn(),
    };

    const ctx = {
      symbol: 'EURUSD',
      timeframe: '1H',
      replayController: mockReplayController as any,
      indicatorManager: mockIndicatorManager as any,
      drawingEngine: null,
    };

    const session = sm.collectCurrentState(ctx, 'My Test Session');
    expect(session.name).toBe('My Test Session');
    expect(session.symbol).toBe('EURUSD');
    expect(session.timeframe).toBe('1H');
    expect(session.replay_state.current_index).toBe(42);
    expect(session.replay_state.speed).toBe(2.0);
    expect(session.indicators).toHaveLength(1);
    expect(session.indicators[0].name).toBe('SMA');
    expect(session.drawings).toEqual([]);
    expect(session.is_autosave).toBe(false);
  });

  it('saveSession returns null when no bridge is connected', async () => {
    const { SessionManager } = await import('../../frontend/src/sessions/session-manager');
    const sm = new SessionManager(null);

    const ctx = {
      symbol: 'BTCUSDT',
      timeframe: '15m',
      replayController: { state: null } as any,
      indicatorManager: { getActiveIndicators: () => [] } as any,
      drawingEngine: null,
    };

    const result = await sm.saveSession(ctx, 'Test');
    expect(result).toBeNull();
  });

  it('listSessions returns empty array when no bridge', async () => {
    const { SessionManager } = await import('../../frontend/src/sessions/session-manager');
    const sm = new SessionManager(null);
    const result = await sm.listSessions();
    expect(result).toEqual([]);
  });

  it('deleteSession returns false when no bridge', async () => {
    const { SessionManager } = await import('../../frontend/src/sessions/session-manager');
    const sm = new SessionManager(null);
    expect(await sm.deleteSession('some-id')).toBe(false);
  });

  it('autosave start/stop does not throw', async () => {
    const { SessionManager } = await import('../../frontend/src/sessions/session-manager');
    const sm = new SessionManager(null, 9999999);
    const ctx = {
      symbol: 'XAUUSD',
      timeframe: '5m',
      replayController: { state: null } as any,
      indicatorManager: { getActiveIndicators: () => [] } as any,
      drawingEngine: null,
    };
    sm.startAutosave(ctx);
    sm.stopAutosave();
    // No errors thrown
  });
});
