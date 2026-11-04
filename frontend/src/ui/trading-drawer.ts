/**
 * Trading Drawer UI — Exness WebTerminal bottom panel with tabs: Open Positions, Pending Orders, Trade Journal & Account Summary.
 */

import type { PythonBridge } from '../bridge/python-bridge';
import type { AuthStateManager } from '../auth/auth-state';
import type { AuthModal } from './auth-modal';
import type { AccountSummary, PositionDefinition, TradeRecord } from '../trading/trading-types';
import { getIcon } from './icons';

export class TradingDrawer {
  private readonly container: HTMLElement;
  private activeTab = 'positions';
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    parent: HTMLElement,
    private readonly bridge: PythonBridge | null,
    private readonly onPositionsUpdated?: (positions: PositionDefinition[]) => void,
    private readonly onAccountSummaryUpdated?: (account: AccountSummary) => void,
    private readonly onModifySlTp?: (pos: PositionDefinition) => void,
    private readonly onPartialClose?: (pos: PositionDefinition, currentPrice: number) => void,
    private readonly onCollapseChange?: (collapsed: boolean) => void,
    private readonly authState?: AuthStateManager | null,
    private readonly authModal?: AuthModal | null,
  ) {
    this.onAccountSummaryUpdated = onAccountSummaryUpdated;
    this.container = this.buildDrawer();
    parent.appendChild(this.container);
  }

  private buildDrawer(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'trading-drawer exness-drawer';
    el.innerHTML = `
      <div class="trading-drawer-header">
        <div class="trading-drawer-tabs">
          <button class="trading-tab active" data-tab="positions">
            <span>Open Positions</span>
          </button>
          <button class="trading-tab" data-tab="orders">
            <span>Pending Orders</span>
          </button>
          <button class="trading-tab" data-tab="journal">
            <span>Trade Journal</span>
          </button>
          <button class="trading-tab" data-tab="account">
            <span>Account Summary</span>
          </button>
        </div>
        <div class="trading-account-pill" id="account-pill">Balance: $10,000.00 | Equity: $10,000.00</div>
        <button class="trading-drawer-toggle" id="drawer-toggle-btn" title="Toggle Drawer">${getIcon('chevron_down')}</button>
      </div>
      <div class="trading-drawer-body">
        <div class="trading-content active" id="tab-positions-content">
          <table class="trading-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th>Volume</th>
                <th>Entry Price</th>
                <th>Current</th>
                <th>SL</th>
                <th>TP</th>
                <th>Unrealized PnL</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="positions-tbody">
              <tr><td colspan="9" class="session-empty">No open positions.</td></tr>
            </tbody>
          </table>
        </div>

        <div class="trading-content" id="tab-orders-content">
          <table class="trading-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th>Type</th>
                <th>Volume</th>
                <th>Price</th>
                <th>SL</th>
                <th>TP</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="orders-tbody">
              <tr><td colspan="8" class="session-empty">No pending orders.</td></tr>
            </tbody>
          </table>
        </div>

        <div class="trading-content" id="tab-journal-content">
          <div id="journal-banner-wrap"></div>
          <table class="trading-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Volume</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>PnL ($)</th>
                <th>PnL (%)</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody id="journal-tbody">
              <tr><td colspan="9" class="session-empty">No closed trades recorded.</td></tr>
            </tbody>
          </table>
        </div>

        <div class="trading-content" id="tab-account-content">
          <div class="account-card-grid" id="account-card-grid"></div>
        </div>
      </div>
    `;

    // Tabs
    el.querySelectorAll('.trading-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.trading-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeTab = (tab as HTMLElement).dataset.tab || 'positions';
        el.querySelectorAll('.trading-content').forEach((c) => c.classList.remove('active'));
        el.querySelector(`#tab-${this.activeTab}-content`)?.classList.add('active');
        void this.refresh();
      });
    });

    // Toggle collapse
    el.querySelector('#drawer-toggle-btn')!.addEventListener('click', () => {
      el.classList.toggle('collapsed');
      const isCollapsed = el.classList.contains('collapsed');
      const icon = el.querySelector('#drawer-toggle-btn');
      if (icon) {
        icon.innerHTML = isCollapsed
          ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`
          : getIcon('chevron_down');
      }
      if (this.onCollapseChange) {
        this.onCollapseChange(isCollapsed);
      }
    });

    return el;
  }

  start(): void {
    void this.refresh();
    if (!this.autoRefreshTimer) {
      this.autoRefreshTimer = setInterval(() => void this.refresh(), 2000);
    }
  }

  setInMemoryPositions(positions: PositionDefinition[]): void {
    const totalLots = positions.reduce((sum, p) => sum + (p.quantity || 0), 0);
    const totalUnrealized = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
    const pill = this.container.querySelector('#account-pill');
    if (pill) {
      const activeStr =
        positions.length > 0
          ? ` | Active: ${positions.length} Pos (${totalLots.toFixed(2)} Lots)`
          : '';
      pill.textContent = `Balance: $10,000.00 | Equity: $${(10000 + totalUnrealized).toFixed(2)} | PnL: ${totalUnrealized >= 0 ? '+' : ''}$${totalUnrealized.toFixed(2)}${activeStr}`;
    }
    if (this.activeTab === 'positions') {
      this.renderPositions(positions);
    }
  }

  async refresh(): Promise<void> {
    if (!this.bridge) return;

    try {
      const isDemo = this.authState ? this.authState.isDemo() : false;

      // 1. Fetch Open Positions
      const posRes = await this.bridge.callJson<{ ok: boolean; data?: PositionDefinition[] }>(
        'getOpenPositions',
        { is_demo: isDemo },
      );
      const positions = posRes.ok && Array.isArray(posRes.data) ? posRes.data : [];
      if (this.onPositionsUpdated) {
        this.onPositionsUpdated(positions);
      }

      // 2. Account Summary
      const accRes = await this.bridge.callJson<{ ok: boolean; data?: AccountSummary }>(
        'getAccountSummary',
        { is_demo: isDemo },
      );
      if (accRes.ok && accRes.data) {
        const acc = accRes.data;
        if (this.onAccountSummaryUpdated) {
          this.onAccountSummaryUpdated(acc);
        }
        const totalLots = positions.reduce((sum, p) => sum + (p.quantity || 0), 0);
        const pill = this.container.querySelector('#account-pill');
        if (pill) {
          const activeStr =
            positions.length > 0
              ? ` | Active: ${positions.length} Pos (${totalLots.toFixed(2)} Lots)`
              : '';
          pill.textContent = `Balance: $${acc.balance.toLocaleString()} | Equity: $${acc.equity.toLocaleString()} | PnL: ${acc.unrealized_pnl >= 0 ? '+' : ''}$${acc.unrealized_pnl.toFixed(2)}${activeStr}`;
        }
        this.renderAccountCards(acc);
      }

      // 3. Tab content
      if (this.activeTab === 'positions') {
        this.renderPositions(positions);
      } else if (this.activeTab === 'orders') {
        const ordRes = await this.bridge.callJson<{ ok: boolean; data?: any[] }>(
          'getPendingOrders',
          {},
        );
        if (ordRes.ok && Array.isArray(ordRes.data)) {
          this.renderOrders(ordRes.data);
        }
      } else if (this.activeTab === 'journal') {
        const jrnRes = await this.bridge.callJson<{ ok: boolean; data?: TradeRecord[] }>(
          'getTradeJournal',
          { is_demo: isDemo },
        );
        if (jrnRes.ok && Array.isArray(jrnRes.data)) {
          this.renderJournal(jrnRes.data);
        }
      }
    } catch {
      /* ignore */
    }
  }

  private renderPositions(positions: PositionDefinition[]): void {
    const tbody = this.container.querySelector('#positions-tbody')!;
    if (positions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="session-empty">No open positions.</td></tr>';
      return;
    }

    tbody.innerHTML = positions
      .map((p) => {
        const sideClass = p.side === 'LONG' ? 'pos-long' : 'pos-short';
        const pnlClass = p.unrealized_pnl >= 0 ? 'pnl-green' : 'pnl-red';
        const pipsText =
          p.pips !== undefined ? ` (${p.pips >= 0 ? '+' : ''}${p.pips.toFixed(1)}p)` : '';
        const lotsText = `${p.quantity.toFixed(2)} Lots`;
        const slDisplay = p.stop_loss !== undefined && p.stop_loss !== null && p.stop_loss > 0 ? p.stop_loss.toFixed(4) : '-';
        const tpDisplay = p.take_profit !== undefined && p.take_profit !== null && p.take_profit > 0 ? p.take_profit.toFixed(4) : '-';

        return `
          <tr data-id="${p.position_id}">
            <td><strong>${p.symbol}</strong></td>
            <td class="${sideClass}">${p.side}</td>
            <td><strong>${lotsText}</strong></td>
            <td>${p.entry_price.toFixed(4)}</td>
            <td>${p.current_price.toFixed(4)}</td>
            <td class="editable-cell sl-cell" title="Double click to edit SL">${slDisplay}</td>
            <td class="editable-cell tp-cell" title="Double click to edit TP">${tpDisplay}</td>
            <td class="${pnlClass}">${p.unrealized_pnl >= 0 ? '+' : ''}$${p.unrealized_pnl.toFixed(2)}${pipsText}</td>
            <td class="action-cell">
              <button class="drawer-action-btn modify-pos-btn" data-id="${p.position_id}" title="Modify SL / TP Targets">🎯 SL/TP</button>
              <button class="drawer-action-btn partial-pos-btn" data-id="${p.position_id}" data-price="${p.current_price}" title="Partial Close">✂️ Partial</button>
              <button class="drawer-action-btn close-pos-btn" data-id="${p.position_id}" data-price="${p.current_price}" title="Close Position">✕ Close</button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.close-pos-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const price = parseFloat((btn as HTMLElement).dataset.price || '0');
        void this.handleClosePosition(id, price);
      });
    });

    tbody.querySelectorAll('.modify-pos-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const pos = positions.find((item) => item.position_id === id);
        if (pos && this.onModifySlTp) {
          this.onModifySlTp(pos);
        }
      });
    });

    tbody.querySelectorAll('.partial-pos-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const price = parseFloat((btn as HTMLElement).dataset.price || '0');
        const pos = positions.find((item) => item.position_id === id);
        if (pos && this.onPartialClose) {
          this.onPartialClose(pos, price);
        }
      });
    });

    tbody.querySelectorAll('.editable-cell').forEach((cell) => {
      cell.addEventListener('dblclick', () => {
        const tr = (cell as HTMLElement).closest('tr');
        const id = tr?.dataset.id;
        const pos = positions.find((item) => item.position_id === id);
        if (pos && this.onModifySlTp) {
          this.onModifySlTp(pos);
        }
      });
    });
  }

  private renderOrders(orders: any[]): void {
    const tbody = this.container.querySelector('#orders-tbody')!;
    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="session-empty">No pending orders.</td></tr>';
      return;
    }

    tbody.innerHTML = orders
      .map((o) => {
        const lotsText = `${typeof o.quantity === 'number' ? o.quantity.toFixed(2) : o.quantity} Lots`;
        return `
        <tr>
          <td><strong>${o.symbol}</strong></td>
          <td class="${o.side === 'BUY' ? 'pos-long' : 'pos-short'}">${o.side}</td>
          <td>${o.order_type}</td>
          <td><strong>${lotsText}</strong></td>
          <td>${typeof o.price === 'number' ? o.price.toFixed(4) : o.price}</td>
          <td>${o.stop_loss ?? '-'}</td>
          <td>${o.take_profit ?? '-'}</td>
          <td><button class="cancel-ord-btn" data-id="${o.order_id}">Cancel</button></td>
        </tr>
      `;
      })
      .join('');

    tbody.querySelectorAll('.cancel-ord-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        void this.handleCancelOrder(id);
      });
    });
  }

  private renderJournal(records: TradeRecord[]): void {
    const bannerWrap = this.container.querySelector('#journal-banner-wrap');
    if (bannerWrap) {
      if (this.authState?.isDemo()) {
        bannerWrap.innerHTML = `
          <div class="demo-journal-warning-banner">
            <div class="warning-banner-text">
              ${getIcon('flask')}
              <span><strong>Demo Session:</strong> Trades placed in demo mode are temporary and will not be saved to your trade history.</span>
            </div>
            <button type="button" class="banner-action-btn" id="save-demo-trades-btn">Save My Trades · Sign In</button>
          </div>
        `;
        bannerWrap.querySelector('#save-demo-trades-btn')?.addEventListener('click', () => {
          this.authModal?.show({
            initialTab: 'register',
            bannerMessage: 'Create an account to save your paper trade history permanently.',
          });
        });
      } else {
        bannerWrap.innerHTML = '';
      }
    }

    const tbody = this.container.querySelector('#journal-tbody')!;
    if (records.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="session-empty">No closed trades recorded.</td></tr>';
      return;
    }

    tbody.innerHTML = records
      .map((r) => {
        const pnlVal = r.pnl ?? 0;
        const pnlClass = pnlVal >= 0 ? 'pnl-green' : 'pnl-red';
        const exitTimestamp = r.closed_at ?? r.opened_at ?? Date.now() / 1000;
        const dateStr = new Date(exitTimestamp * 1000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        return `
        <tr>
          <td>${dateStr}</td>
          <td><strong>${r.symbol}</strong></td>
          <td class="${r.side === 'LONG' || r.side === 'BUY' ? 'pos-long' : 'pos-short'}">${r.side}</td>
          <td>${r.quantity.toFixed(2)} Lots</td>
          <td>${r.entry_price.toFixed(4)}</td>
          <td>${r.exit_price.toFixed(4)}</td>
          <td class="${pnlClass}">${pnlVal >= 0 ? '+' : ''}$${pnlVal.toFixed(2)}</td>
          <td class="${pnlClass}">${r.pnl_percent >= 0 ? '+' : ''}${r.pnl_percent.toFixed(2)}%</td>
          <td>${r.exit_reason || 'MANUAL'}</td>
        </tr>
      `;
      })
      .join('');
  }

  private renderAccountCards(acc: AccountSummary): void {
    const grid = this.container.querySelector('#account-card-grid')!;
    const balance = acc.balance ?? 0;
    const equity = acc.equity ?? 0;
    const unrealizedPnl = acc.unrealized_pnl ?? 0;
    const marginUsed = acc.margin_used ?? 0;
    const freeMargin = acc.free_margin ?? 0;
    const pnlColor = unrealizedPnl >= 0 ? '#089981' : '#f23645';
    const marginLevel =
      marginUsed > 0 ? (equity / marginUsed) * 100 : 0;

    grid.innerHTML = `
      <div class="account-card">
        <span class="account-card-label">Balance</span>
        <span class="account-card-val">$${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="account-card">
        <span class="account-card-label">Equity</span>
        <span class="account-card-val">$${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="account-card">
        <span class="account-card-label">Margin Used</span>
        <span class="account-card-val">$${marginUsed.toFixed(2)}</span>
      </div>
      <div class="account-card">
        <span class="account-card-label">Free Margin</span>
        <span class="account-card-val">$${freeMargin.toFixed(2)}</span>
      </div>
      <div class="account-card">
        <span class="account-card-label">Margin Level</span>
        <span class="account-card-val">${marginLevel > 0 ? `${marginLevel.toFixed(1)}%` : '∞'}</span>
      </div>
      <div class="account-card">
        <span class="account-card-label">Floating P&L</span>
        <span class="account-card-val" style="color: ${pnlColor}">${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)}</span>
      </div>
    `;
  }

  private async handleClosePosition(positionId: string, currentPrice: number): Promise<void> {
    if (!this.bridge) return;
    try {
      await this.bridge.callJson('closePosition', {
        position_id: positionId,
        exit_price: currentPrice,
        reason: 'MANUAL_CLOSE',
      });
      void this.refresh();
    } catch {
      /* ignore */
    }
  }

  private async handleCancelOrder(orderId: string): Promise<void> {
    if (!this.bridge) return;
    try {
      await this.bridge.callJson('cancelOrder', orderId);
      void this.refresh();
    } catch {
      /* ignore */
    }
  }
}
