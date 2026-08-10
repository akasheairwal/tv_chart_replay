import type { PythonBridge } from '../bridge/python-bridge';

export interface SymbolSearchResult {
  symbol: string;
  display_name: string;
  asset_class: string;
  exchange: string;
  provider_candidates: string[];
}

interface SearchResponse {
  ok: boolean;
  data?: SymbolSearchResult[];
  error?: string;
}

/**
 * Debounced symbol search over the local symbol registry
 * (architecture #8). Falls back to a friendly message in browser mode.
 */
export class SymbolSearch {
  private latestQuery = '';

  constructor(
    private readonly list: HTMLElement,
    private readonly input: HTMLInputElement,
    private readonly bridge: PythonBridge | null,
    private readonly onSelect: (result: SymbolSearchResult) => void,
  ) {}

  wire(): void {
    let timer: number | undefined;
    this.input.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void this.refresh(), 250);
    });
  }

  async refresh(): Promise<void> {
    const query = this.input.value.trim();
    this.latestQuery = query;
    this.list.replaceChildren();
    if (!query) return this.renderMessage('Type to search symbols');
    if (!this.bridge) return this.renderMessage('Qt bridge unavailable - search disabled');

    let response: SearchResponse;
    try {
      response = await this.bridge.callJson<SearchResponse>('searchSymbols', query);
    } catch (error) {
      return this.renderMessage(`Search failed: ${String(error)}`);
    }
    if (query !== this.latestQuery) return; // stale response

    if (!response.ok) return this.renderMessage(`Error: ${response.error ?? 'unknown'}`);
    const results = response.data ?? [];
    if (results.length === 0) return this.renderMessage('No matches');

    for (const item of results) {
      const row = document.createElement('li');
      row.className = 'symbol-result';
      const name = document.createElement('span');
      name.className = 'symbol-name';
      name.textContent = item.symbol;
      const meta = document.createElement('span');
      meta.className = 'symbol-meta';
      meta.textContent = `${item.display_name || item.symbol} · ${item.asset_class} · ${
        item.exchange || '—'
      }`;
      row.append(name, meta);
      row.addEventListener('click', () => this.onSelect(item));
      this.list.appendChild(row);
    }
  }

  private renderMessage(text: string): void {
    const row = document.createElement('li');
    row.className = 'symbol-empty';
    row.textContent = text;
    this.list.appendChild(row);
  }
}