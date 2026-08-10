import type { PythonBridge } from '../bridge/python-bridge';
import { getIcon } from './icons';

export interface WatchlistItem {
  symbol: string;
  name: string;
  assetClass: string;
  isFavorite?: boolean;
}

export const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { symbol: 'EURUSD', name: 'EUR / USD', assetClass: 'forex', isFavorite: true },
  { symbol: 'GBPUSD', name: 'GBP / USD', assetClass: 'forex', isFavorite: true },
  { symbol: 'BTCUSDT', name: 'BTC / USDT', assetClass: 'crypto', isFavorite: true },
  { symbol: 'ETHUSDT', name: 'ETH / USDT', assetClass: 'crypto', isFavorite: false },
  { symbol: 'XAUUSD', name: 'Gold / USD', assetClass: 'commodity', isFavorite: true },
  { symbol: 'SPY', name: 'S&P 500 ETF', assetClass: 'stock', isFavorite: false },
];

export class Watchlist {
  private activeSymbol = '';
  private items: WatchlistItem[] = DEFAULT_WATCHLIST;
  private readonly panelEl: HTMLElement | null;

  constructor(
    private readonly container: HTMLElement,
    private readonly onSelect: (symbol: string) => void,
    private readonly bridge: PythonBridge | null = null,
    private readonly onCollapseChange?: (collapsed: boolean) => void,
  ) {
    this.panelEl = document.getElementById('watchlist-panel');
  }

  async init(): Promise<void> {
    if (this.bridge) {
      try {
        const res = await this.bridge.callJson<{ ok: boolean; data?: any[] }>('getWatchlist', {});
        if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
          this.items = res.data.map((item) => ({
            symbol: item.symbol,
            name: item.display_name || item.symbol,
            assetClass: item.asset_type || 'forex',
            isFavorite: Boolean(item.is_favorite),
          }));
        }
      } catch {
        // Keep default list on fallback
      }
    }
    this.render();
    this.wireCollapseBtn();
  }

  private wireCollapseBtn(): void {
    const btn = document.getElementById('watchlist-collapse-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        this.collapse();
      });
    }
    const expandHandle = document.getElementById('watchlist-expand-handle');
    if (expandHandle) {
      expandHandle.addEventListener('click', () => {
        this.expand();
      });
    }
  }

  toggleCollapse(): void {
    if (this.isCollapsed()) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  collapse(): void {
    if (this.panelEl) {
      this.panelEl.classList.add('collapsed');
      const expandHandle = document.getElementById('watchlist-expand-handle');
      if (expandHandle) expandHandle.classList.add('visible');
      if (this.onCollapseChange) this.onCollapseChange(true);
    }
  }

  expand(): void {
    if (this.panelEl) {
      this.panelEl.classList.remove('collapsed');
      const expandHandle = document.getElementById('watchlist-expand-handle');
      if (expandHandle) expandHandle.classList.remove('visible');
      if (this.onCollapseChange) this.onCollapseChange(false);
    }
  }

  isCollapsed(): boolean {
    return this.panelEl ? this.panelEl.classList.contains('collapsed') : false;
  }

  async addItem(symbol: string, name?: string, assetClass = 'forex'): Promise<void> {
    const sym = symbol.toUpperCase().trim();
    if (!sym) return;
    if (!this.items.find((i) => i.symbol === sym)) {
      const newItem: WatchlistItem = {
        symbol: sym,
        name: name || sym,
        assetClass,
        isFavorite: false,
      };
      this.items.push(newItem);
      this.render();
      if (this.bridge) {
        try {
          await this.bridge.callJson('addWatchlistItem', {
            symbol: sym,
            display_name: name || sym,
            asset_type: assetClass,
          });
        } catch {
          /* ignore bridge error */
        }
      }
    }
  }

  async removeItem(symbol: string): Promise<void> {
    this.items = this.items.filter((i) => i.symbol !== symbol);
    this.render();
    if (this.bridge) {
      try {
        await this.bridge.callJson('removeWatchlistItem', symbol);
      } catch {
        /* ignore bridge error */
      }
    }
  }

  async toggleFavorite(symbol: string): Promise<void> {
    const item = this.items.find((i) => i.symbol === symbol);
    if (item) {
      item.isFavorite = !item.isFavorite;
      this.items.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
      this.render();
      if (this.bridge) {
        try {
          await this.bridge.callJson('toggleFavoriteWatchlist', symbol);
        } catch {
          /* ignore bridge error */
        }
      }
    }
  }

  render(items?: WatchlistItem[]): void {
    if (items) {
      this.items = items;
    }
    this.container.innerHTML = '';

    // Add Symbol Bar with SVG search icon
    const addBar = document.createElement('div');
    addBar.className = 'watchlist-add-bar';
    addBar.innerHTML = `<span class="watchlist-search-icon">${getIcon('search')}</span>`;

    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.placeholder = 'Add symbol…';
    addInput.className = 'watchlist-add-input';
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = addInput.value.trim();
        if (val) {
          void this.addItem(val);
          addInput.value = '';
        }
      }
    });
    addBar.appendChild(addInput);
    this.container.appendChild(addBar);

    const ul = document.createElement('ul');
    ul.className = 'watchlist-items';

    for (const item of this.items) {
      const li = document.createElement('li');
      li.className = `watchlist-item ${item.symbol === this.activeSymbol ? 'active' : ''}`;

      const starBtn = document.createElement('button');
      starBtn.className = `watchlist-star-btn ${item.isFavorite ? 'fav' : ''}`;
      starBtn.innerHTML = item.isFavorite
        ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="#ffb703" stroke="#ffb703"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
        : `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#787b86" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
      starBtn.title = item.isFavorite ? 'Unfavorite' : 'Favorite';
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.toggleFavorite(item.symbol);
      });

      const symWrap = document.createElement('div');
      symWrap.className = 'watchlist-sym-wrap';

      const sym = document.createElement('span');
      sym.className = 'watchlist-symbol';
      sym.textContent = item.symbol;

      const name = document.createElement('span');
      name.className = 'watchlist-name';
      name.textContent = item.name;

      symWrap.append(sym, name);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'watchlist-remove-btn';
      removeBtn.innerHTML = getIcon('close');
      removeBtn.title = 'Remove from watchlist';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.removeItem(item.symbol);
      });

      li.append(starBtn, symWrap, removeBtn);
      li.addEventListener('click', () => {
        this.setActive(item.symbol);
        this.onSelect(item.symbol);
      });

      ul.appendChild(li);
    }

    this.container.appendChild(ul);
  }

  getItems(): WatchlistItem[] {
    return this.items;
  }

  setActive(symbol: string): void {
    this.activeSymbol = symbol;
    const items = this.container.querySelectorAll('.watchlist-item');
    items.forEach((el) => {
      const symText = el.querySelector('.watchlist-symbol')?.textContent;
      if (symText === symbol) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }
}