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

  // Fast-path: check if rows are already strictly ascending (standard from Parquet/backend)
  let isStrictlyAscending = true;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] <= rows[i - 1][0]) {
      isStrictlyAscending = false;
      break;
    }
  }

  let sourceRows = rows;
  if (!isStrictlyAscending) {
    // Fallback: sort and deduplicate only if out-of-order or duplicate timestamps exist
    const sorted = [...rows].sort((a, b) => a[0] - b[0]);
    const deduplicated: CompactCandleRow[] = [];
    for (const row of sorted) {
      if (deduplicated.length === 0 || deduplicated[deduplicated.length - 1][0] !== row[0]) {
        deduplicated.push(row);
      }
    }
    sourceRows = deduplicated;
  }

  const n = sourceRows.length;
  const candles: CandlestickData<UTCTimestamp>[] = new Array(n);
  const volumes: HistogramData<UTCTimestamp>[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const row = sourceRows[i];
    const time = row[0] as UTCTimestamp;
    const open = row[1];
    const high = row[2];
    const low = row[3];
    const close = row[4];
    const volume = row[5];

    candles[i] = { time, open, high, low, close };
    volumes[i] = {
      time,
      value: volume,
      color: close >= open ? UP_VOLUME_COLOR : DOWN_VOLUME_COLOR,
    };
  }

  return { candles, volumes };
}
