import type { CandlestickData, HistogramData, UTCTimestamp } from 'lightweight-charts';

export type CompactCandleRow = [
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
];

export interface HistoryPayload {
  columns: string[];
  count: number;
  rows: CompactCandleRow[];
}

export interface ParsedSeriesData {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
}

const UP_VOLUME_COLOR = 'rgba(8, 153, 129, 0.5)';
const DOWN_VOLUME_COLOR = 'rgba(242, 54, 69, 0.5)';

/**
 * Transform compact array rows `[[timestamp, o, h, l, c, v], ...]` into Lightweight Charts format.
 * Sorts and deduplicates by timestamp to meet Lightweight Charts strict ascending requirement.
 */
export function parseCompactHistory(rows: CompactCandleRow[]): ParsedSeriesData {
  if (!rows || rows.length === 0) {
    return { candles: [], volumes: [] };
  }

  // Deduplicate and ensure strict ascending order by timestamp
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  const deduplicated: CompactCandleRow[] = [];

  for (const row of sorted) {
    if (deduplicated.length === 0 || deduplicated[deduplicated.length - 1][0] !== row[0]) {
      deduplicated.push(row);
    }
  }

  const candles: CandlestickData<UTCTimestamp>[] = [];
  const volumes: HistogramData<UTCTimestamp>[] = [];

  for (const [timestamp, open, high, low, close, volume] of deduplicated) {
    const time = timestamp as UTCTimestamp;
    candles.push({
      time,
      open,
      high,
      low,
      close,
    });

    const isUp = close >= open;
    volumes.push({
      time,
      value: volume,
      color: isUp ? UP_VOLUME_COLOR : DOWN_VOLUME_COLOR,
    });
  }

  return { candles, volumes };
}
