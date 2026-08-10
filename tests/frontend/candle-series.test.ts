import { describe, expect, it } from 'vitest';
import { parseCompactHistory, type CompactCandleRow } from '../../frontend/src/chart/candle-series';

describe('parseCompactHistory', () => {
  it('parses compact history array into candlestick and volume series format', () => {
    const rawRows: CompactCandleRow[] = [
      [1700000000, 100.0, 105.0, 99.0, 104.0, 1500],
      [1700003600, 104.0, 106.0, 102.0, 101.0, 2000],
    ];

    const { candles, volumes } = parseCompactHistory(rawRows);

    expect(candles).toHaveLength(2);
    expect(volumes).toHaveLength(2);

    expect(candles[0]).toEqual({
      time: 1700000000,
      open: 100.0,
      high: 105.0,
      low: 99.0,
      close: 104.0,
    });

    expect(volumes[0]).toEqual({
      time: 1700000000,
      value: 1500,
      color: 'rgba(8, 153, 129, 0.5)', // close >= open (green)
    });

    expect(volumes[1]).toEqual({
      time: 1700003600,
      value: 2000,
      color: 'rgba(242, 54, 69, 0.5)', // close < open (red)
    });
  });

  it('handles empty input gracefully', () => {
    const { candles, volumes } = parseCompactHistory([]);
    expect(candles).toEqual([]);
    expect(volumes).toEqual([]);
  });

  it('sorts and deduplicates rows by timestamp', () => {
    const unsortedRows: CompactCandleRow[] = [
      [1700003600, 104, 106, 102, 101, 2000],
      [1700000000, 100, 105, 99, 104, 1500],
      [1700000000, 100, 105, 99, 104, 1500], // duplicate
    ];

    const { candles } = parseCompactHistory(unsortedRows);
    expect(candles).toHaveLength(2);
    expect(candles[0].time).toBe(1700000000);
    expect(candles[1].time).toBe(1700003600);
  });
});
