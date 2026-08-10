import type { PythonBridge } from '../bridge/python-bridge';

export interface DatasetInfo {
  dataset_id: string;
  symbol: string;
  timeframe: string;
  status: string;
  row_count?: number;
  start?: number | null;
  end?: number | null;
  provider?: string;
  dataset_version?: number;
  coverage?: number[][];
}

const WATCHED_EVENTS = [
  'download.started',
  'download.progress',
  'download.completed',
  'download.failed',
  'dataset.missing',
  'dataset.ready',
  'dataset.invalid',
  'dataset.updated',
];

export function describeInterval(start?: number | null, end?: number | null): string {
  if (start == null || end == null) return '';
  const fmt = (value: number): string => new Date(value * 1000).toISOString().slice(0, 10);
  return `${fmt(start)} → ${fmt(end)}`;
}

/**
 * Renders download progress + dataset status from Python events
 * (data-status panel, Wave 1).
 */
export class DataStatus {
  private activeSymbol = '';
  private _activeTimeframe = '1H';

  get activeTimeframe(): string {
    return this._activeTimeframe;
  }

  constructor(
    private readonly container: HTMLElement,
    private readonly bridge: PythonBridge | null,
  ) {}

  wire(): void {
    if (!this.bridge) return;
    for (const event of WATCHED_EVENTS) {
      this.bridge.onEvent(event, (payload) => this.onEvent(event, payload as Record<string, unknown>));
    }
  }

  setActive(symbol: string, timeframe: string): void {
    this.activeSymbol = symbol;
    this._activeTimeframe = timeframe;
    this.showLine([`${symbol} · ${timeframe}`]);
  }

  showInfo(info: DatasetInfo): void {
    const covered = Array.isArray(info.coverage) ? info.coverage.length : 0;
    const lines = [
      `<span class="ds-status ds-${info.status.toLowerCase()}">${info.status}</span>`,
      `<span>${info.dataset_id} · v${info.dataset_version ?? '?'}</span>`,
      `<span>rows: ${info.row_count ?? 0} · provider: ${info.provider ?? '—'}</span>`,
      `<span>${covered} coverage interval(s)</span>`,
    ];
    this.showLine(lines);
  }

  onEvent(event: string, payload: Record<string, unknown>): void {
    const symbol = String(payload.symbol ?? '');
    if (symbol && symbol !== this.activeSymbol) return;

    const kind = event.split('.')[1] ?? event;
    const line: string[] = [`<span class="ev-${kind}">● ${event}</span>`];
    if (typeof payload.message === 'string' && payload.message) {
      line.push(`<span>${payload.message}</span>`);
    }
    if (typeof payload.percent === 'number') {
      const pct = Math.max(0, Math.min(100, Number(payload.percent)));
      line.push(
        `<div class="progress"><div class="progress-bar" style="width:${pct.toFixed(1)}%"></div></div>`,
      );
      line.push(`<span>${pct.toFixed(1)}%</span>`);
    }
    if (typeof payload.rows === 'number') line.push(`<span>rows: ${payload.rows}</span>`);
    if (typeof payload.error === 'string' && payload.error) {
      line.push(`<span class="ev-failed">error: ${payload.error}</span>`);
    }
    if (typeof payload.status === 'string') {
      line.push(`<span class="ev-ready">status: ${payload.status}</span>`);
    }
    this.showLine(line);
  }

  private showLine(fragments: string[]): void {
    this.container.innerHTML = fragments.join('');
  }
}