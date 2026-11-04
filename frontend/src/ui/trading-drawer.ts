/**
 * Trading Drawer UI — Exness WebTerminal bottom panel with tabs: Open Positions, Pending Orders, Trade Journal & Account Summary.
 * Redesigned with 3-zone header, live counter badges, modular metric capsules,
 * first-class Add/Reset Capital Popovers, and draggable top split-pane resizer. (ADR 0010 / Phase 3)
 */

import type { PythonBridge } from '../bridge/python-bridge';
import type { AuthStateManager } from '../auth/auth-state';
import type { AuthModal } from './auth-modal';
import type { AccountSummary, PositionDefinition, TradeRecord } from '../trading/trading-types';
import { getIcon } from './icons';
import { CapitalPopoverManager } from './capital-popover';

export class TradingDrawer {
  private readonly container: HTMLElement;
  private activeTab = 'positions';
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly capitalManager = new CapitalPopoverManager();
  private journalFilter: 'all' | 'wins' | 'losses' = 'all';

  private currentPositions: PositionDefinition[] = [];
  private currentOrders: any[] = [];
  private currentJournal: TradeRecord[] = [];
  private currentAccount: AccountSummary = {
    balance: 10000,
    equity: 10000,
    free_margin: 10000,
    margin_used: 0,
    unrealized_pnl: 0,
    realized_pnl: 0,
    total_trades: 0,
    winning_trades: 0,
    losing_trades: 0,
    win_rate: 0,
  };

  private currentHeight = 200;
  private isMaximized = false;

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
    private readonly onToast?: (msg: string) => void,
  ) {
    this.onAccountSummaryUpdated = onAccountSummaryUpdated;

    // Restore saved height from localStorage if valid
    if (typeof localStorage !== 'undefined') {
      const savedH = parseInt(localStorage.getItem('trading_drawer_height') || '200', 10);
      if (!isNaN(savedH) && savedH >= 80) {
        this.currentHeight = savedH;
      }
    }

    this.container = this.buildDrawer();
    parent.appendChild(this.container);
    this.applyHeight(this.currentHeight);
    this.updateMetrics(this.currentAccount, 0, 0);
  }

  private buildDrawer(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'trading-drawer exness-drawer';

    el.innerHTML = `
      <!-- Top Draggable Split-Pane Resizer Rail -->
      <div class="trading-drawer-resizer" id="drawer-resizer" title="Drag to resize panel (Double-click to snap)"></div>

      <!-- Header: 3-Zone Ergonomic Strip -->
      <div class="trading-drawer-header">
        <!-- Zone 1: Navigation Tabs with Live Badges -->
        <div class="trading-drawer-tabs">
          <button class="trading-tab active" data-tab="positions">
            <span class="tab-icon">${getIcon('activity')}</span>
            <span class="tab-label">Positions</span>
            <span class="tab-badge" id="badge-positions">0</span>
          </button>
          <button class="trading-tab" data-tab="orders">
            <span class="tab-icon">${getIcon('history')}</span>
            <span class="tab-label">Orders</span>
            <span class="tab-badge" id="badge-orders">0</span>
          </button>
          <button class="trading-tab" data-tab="journal">
            <span class="tab-icon">${getIcon('sessions')}</span>
            <span class="tab-label">Journal</span>
            <span class="tab-badge" id="badge-journal">0</span>
          </button>
          <button class="trading-tab" data-tab="account">
            <span class="tab-icon">${getIcon('user')}</span>
            <span class="tab-label">Summary</span>
          </button>
        </div>

        <!-- Zone 2: Financial Telemetry Capsules (Wrapped in #account-pill for contract compatibility) -->
        <div class="trading-account-pill" id="account-pill" title="Trading Account Capital Telemetry">
          <div class="metric-capsule" id="capsule-bal" title="Account Balance">
            <span class="metric-label">BAL</span>
            <span class="metric-val" id="metric-bal">$10,000.00</span>
          </div>
          <div class="metric-capsule" id="capsule-eq" title="Account Equity">
            <span class="metric-label">EQ</span>
            <span class="metric-val" id="metric-eq">$10,000.00</span>
          </div>
          <div class="metric-capsule" id="capsule-pnl" title="Unrealized Floating P&L">
            <span class="metric-label">P&L</span>
            <span class="metric-val pnl-zero" id="metric-pnl">+$0.00</span>
          </div>
          <div class="metric-capsule secondary-metric" id="capsule-free" title="Available Free Margin">
            <span class="metric-label">FREE</span>
            <span class="metric-val" id="metric-free">$10,000.00</span>
          </div>
        </div>

        <!-- Zone 3: Capital Management & Window Controls -->
        <div class="trading-drawer-actions">
          <button type="button" class="drawer-action-chip" id="drawer-add-balance-btn" title="Add / Deposit Paper Capital">
            ${getIcon('plus')}
            <span>Add</span>
          </button>
          <button type="button" class="drawer-action-chip" id="drawer-reset-balance-btn" title="Reset Paper Account Baseline">
            ${getIcon('refresh')}
            <span>Reset</span>
          </button>
          <button type="button" class="bulk-action-btn danger-btn" id="drawer-bulk-action-btn" style="display: none;"></button>
          <button type="button" class="drawer-window-btn" id="drawer-maximize-btn" title="Maximize Panel">
            ${getIcon('layout_1')}
          </button>
          <button type="button" class="drawer-window-btn trading-drawer-toggle" id="drawer-toggle-btn" title="Toggle Drawer">
            ${getIcon('chevron_down')}
          </button>
        </div>
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
                <th>Pips</th>
                <th class="action-th">Action</th>
              </tr>
            </thead>
            <tbody id="positions-tbody">
              <tr><td colspan="10" class="session-empty">No open positions.</td></tr>
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
                <th>Trigger Price</th>
                <th>Current Price</th>
                <th>SL</th>
                <th>TP</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="orders-tbody">
              <tr><td colspan="9" class="session-empty">No pending orders.</td></tr>
            </tbody>
          </table>
        </div>

        <div class="trading-content" id="tab-journal-content">
          <div id="journal-banner-wrap"></div>
          <div class="journal-toolbar" id="journal-toolbar">
            <div class="journal-perf-strip" id="journal-perf-strip">
              <div class="perf-metric" title="Total Closed Trades">
                <span class="perf-label">Trades:</span>
                <span class="perf-val" id="perf-trades-val">0</span>
              </div>
              <div class="perf-metric" title="Win Rate %">
                <span class="perf-label">Win Rate:</span>
                <span class="perf-val" id="perf-winrate-val">0.0%</span>
              </div>
              <div class="perf-metric" title="Total Net Closed P&L">
                <span class="perf-label">Net PnL:</span>
                <span class="perf-val" id="perf-netpnl-val">+$0.00</span>
              </div>
              <div class="perf-metric" title="Profit Factor (Gross Profit / Gross Loss)">
                <span class="perf-label">Profit Factor:</span>
                <span class="perf-val" id="perf-pf-val">0.00</span>
              </div>
              <div class="perf-metric" title="Best Winning Trade">
                <span class="perf-label">Best:</span>
                <span class="perf-val" id="perf-best-val">+$0.00</span>
              </div>
            </div>
            <div class="journal-actions-cluster">
              <div class="journal-filter-chips">
                <button type="button" class="journal-filter-chip active" data-filter="all">All</button>
                <button type="button" class="journal-filter-chip" data-filter="wins">Wins</button>
                <button type="button" class="journal-filter-chip" data-filter="losses">Losses</button>
              </div>
              <button type="button" class="drawer-action-chip journal-export-btn" id="journal-export-btn" title="Export Closed Trades to CSV">
                ${getIcon('download')}
                <span>CSV</span>
              </button>
            </div>
          </div>
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
                <th>Hold</th>
              </tr>
            </thead>
            <tbody id="journal-tbody">
              <tr><td colspan="10" class="session-empty">No closed trades recorded.</td></tr>
            </tbody>
          </table>
        </div>

        <div class="trading-content" id="tab-account-content">
          <div class="account-card-grid" id="account-card-grid"></div>
          <div class="account-capital-dock" id="account-capital-dock">
            <div class="dock-section">
              <div class="dock-section-header">
                <span class="dock-section-title">Quick Deposit</span>
                <span class="dock-section-sub">Add simulation funds immediately to paper balance</span>
              </div>
              <div class="dock-chips">
                <button type="button" class="dock-chip-btn" data-add="1000">+$1,000</button>
                <button type="button" class="dock-chip-btn" data-add="5000">+$5,000</button>
                <button type="button" class="dock-chip-btn" data-add="10000">+$10,000</button>
                <button type="button" class="dock-chip-btn dock-chip-custom" id="dock-custom-add-btn">Custom Deposit...</button>
              </div>
            </div>
            <div class="dock-section">
              <div class="dock-section-header">
                <span class="dock-section-title">Reset Account Baseline</span>
                <span class="dock-section-sub">Reset starting balance & clear active risk</span>
              </div>
              <div class="dock-chips">
                <button type="button" class="dock-chip-btn danger-hover" data-reset="10000">Reset to $10,000</button>
                <button type="button" class="dock-chip-btn danger-hover" data-reset="50000">Reset to $50,000</button>
                <button type="button" class="dock-chip-btn danger-hover" data-reset="100000">Reset to $100,000</button>
                <button type="button" class="dock-chip-btn danger-hover dock-chip-custom" id="dock-custom-reset-btn">Custom Baseline...</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Tabs switching
    el.querySelectorAll('.trading-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.trading-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeTab = (tab as HTMLElement).dataset.tab || 'positions';
        el.querySelectorAll('.trading-content').forEach((c) => c.classList.remove('active'));
        el.querySelector(`#tab-${this.activeTab}-content`)?.classList.add('active');
        this.updateBulkButton();
        void this.refresh();
      });
    });

    // Draggable Resizer Rail
    const resizer = el.querySelector<HTMLElement>('#drawer-resizer');
    if (resizer) {
      let isDragging = false;
      let startY = 0;
      let startH = 0;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging) return;
        const delta = startY - ev.clientY;
        const targetHeight = Math.max(38, Math.min(window.innerHeight - 80, startH + delta));
        if (targetHeight <= 50) {
          if (!el.classList?.contains?.('collapsed')) {
            this.setCollapsed(true);
          }
        } else {
          if (el.classList?.contains?.('collapsed')) {
            this.setCollapsed(false);
          }
          this.currentHeight = targetHeight;
          this.applyHeight(targetHeight);
        }
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        resizer.classList.remove('dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        if (typeof localStorage !== 'undefined' && !el.classList?.contains?.('collapsed')) {
          localStorage.setItem('trading_drawer_height', String(this.currentHeight));
        }
      };

      resizer.addEventListener('mousedown', (ev: MouseEvent) => {
        ev.preventDefault();
        isDragging = true;
        startY = ev.clientY;
        startH = el.offsetHeight;
        resizer.classList.add('dragging');
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      resizer.addEventListener('dblclick', () => {
        if (el.classList?.contains?.('collapsed') || this.currentHeight < 100) {
          this.setCollapsed(false);
          this.currentHeight = 200;
        } else if (this.currentHeight >= 100 && this.currentHeight < 280) {
          this.currentHeight = 380;
        } else {
          this.currentHeight = 200;
        }
        this.applyHeight(this.currentHeight);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('trading_drawer_height', String(this.currentHeight));
        }
      });
    }

    // Toggle collapse
    el.querySelector('#drawer-toggle-btn')?.addEventListener('click', () => {
      const isCollapsed = !el.classList?.contains?.('collapsed');
      this.setCollapsed(isCollapsed);
    });

    // Maximize toggle
    el.querySelector('#drawer-maximize-btn')?.addEventListener('click', () => {
      this.isMaximized = !this.isMaximized;
      el.classList.toggle('maximized', this.isMaximized);
      const btn = el.querySelector<HTMLButtonElement>('#drawer-maximize-btn');
      if (this.isMaximized) {
        el.classList.remove('collapsed');
        if (btn) btn.title = 'Restore Panel Height';
      } else {
        this.applyHeight(this.currentHeight);
        if (btn) btn.title = 'Maximize Panel';
      }
      if (this.onCollapseChange) {
        this.onCollapseChange(false);
      }
    });

    // Add Balance Popover trigger
    el.querySelector('#drawer-add-balance-btn')?.addEventListener('click', () => {
      const addBtn = el.querySelector<HTMLElement>('#drawer-add-balance-btn')!;
      this.capitalManager.showAddBalance({
        anchorEl: addBtn,
        currentBalance: this.currentAccount.balance,
        onConfirm: async (amount, note) => {
          await this.handleAddBalance(amount, note);
        },
      });
    });

    // Reset Balance Popover trigger
    el.querySelector('#drawer-reset-balance-btn')?.addEventListener('click', () => {
      const resetBtn = el.querySelector<HTMLElement>('#drawer-reset-balance-btn')!;
      this.capitalManager.showResetBalance({
        anchorEl: resetBtn,
        currentBalance: this.currentAccount.balance,
        onConfirm: async (initialBalance, clearJournal) => {
          await this.handleResetBalance(initialBalance, clearJournal);
        },
      });
    });

    // Bulk Action Button (Close All / Cancel All)
    el.querySelector('#drawer-bulk-action-btn')?.addEventListener('click', () => {
      void this.handleBulkAction();
    });

    // Journal Filter Chips (All, Wins, Losses)
    el.querySelectorAll('.journal-filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        el.querySelectorAll('.journal-filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.journalFilter = ((chip as HTMLElement).dataset.filter as any) || 'all';
        this.renderJournal(this.currentJournal);
      });
    });

    // Journal CSV Export Button
    el.querySelector('#journal-export-btn')?.addEventListener('click', () => {
      this.exportJournalCsv(this.currentJournal);
    });

    // Embedded Account Summary Capital Management Dock — Quick Deposit Presets
    el.querySelectorAll<HTMLButtonElement>('.dock-chip-btn[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const amt = parseFloat(btn.dataset.add || '1000');
        void this.handleAddBalance(amt, 'Quick Top-Up');
      });
    });

    // Embedded Account Summary Capital Management Dock — Custom Deposit
    el.querySelector('#dock-custom-add-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const customBtn = el.querySelector<HTMLElement>('#dock-custom-add-btn') || el.querySelector<HTMLElement>('#drawer-add-balance-btn')!;
      this.capitalManager.showAddBalance({
        anchorEl: customBtn,
        currentBalance: this.currentAccount.balance,
        onConfirm: async (amount, note) => {
          await this.handleAddBalance(amount, note);
        },
      });
    });

    // Embedded Account Summary Capital Management Dock — Quick Reset Presets
    el.querySelectorAll<HTMLButtonElement>('.dock-chip-btn[data-reset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const baseline = parseFloat(btn.dataset.reset || '10000');
        void this.handleResetBalance(baseline, false);
      });
    });

    // Embedded Account Summary Capital Management Dock — Custom Reset Baseline
    el.querySelector('#dock-custom-reset-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const customBtn = el.querySelector<HTMLElement>('#dock-custom-reset-btn') || el.querySelector<HTMLElement>('#drawer-reset-balance-btn')!;
      this.capitalManager.showResetBalance({
        anchorEl: customBtn,
        currentBalance: this.currentAccount.balance,
        onConfirm: async (initialBalance, clearJournal) => {
          await this.handleResetBalance(initialBalance, clearJournal);
        },
      });
    });

    return el;
  }

  private applyHeight(h: number): void {
    const isCollapsed = Boolean(this.container?.classList?.contains?.('collapsed'));
    if (this.container && !isCollapsed && !this.isMaximized) {
      if (this.container.style) {
        this.container.style.height = `${h}px`;
      }
    }
  }

  setCollapsed(collapsed: boolean): void {
    if (collapsed) {
      this.container.classList?.add('collapsed');
      if (this.container.style) {
        this.container.style.height = '38px';
      }
      const icon = this.container.querySelector('#drawer-toggle-btn');
      if (icon) {
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`;
      }
    } else {
      this.container.classList?.remove('collapsed');
      this.applyHeight(this.currentHeight);
      const icon = this.container.querySelector('#drawer-toggle-btn');
      if (icon) {
        icon.innerHTML = getIcon('chevron_down');
      }
    }
    if (this.onCollapseChange) {
      this.onCollapseChange(collapsed);
    }
  }

  isCollapsed(): boolean {
    return Boolean(this.container?.classList?.contains?.('collapsed'));
  }

  isMaximizedState(): boolean {
    return this.isMaximized;
  }

  isAddPopoverOpen(): boolean {
    return this.capitalManager.isAddOpen();
  }

  isResetPopoverOpen(): boolean {
    return this.capitalManager.isResetOpen();
  }

  start(): void {
    void this.refresh();
    if (!this.autoRefreshTimer) {
      this.autoRefreshTimer = setInterval(() => void this.refresh(), 2000);
    }
  }

  setInMemoryPositions(positions: PositionDefinition[]): void {
    this.currentPositions = positions;
    const totalLots = positions.reduce((sum, p) => sum + (p.quantity || 0), 0);
    const totalUnrealized = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
    const curBal = this.currentAccount.balance || 10000;
    const curEquity = curBal + totalUnrealized;

    this.currentAccount = {
      ...this.currentAccount,
      balance: curBal,
      equity: curEquity,
      unrealized_pnl: totalUnrealized,
      free_margin: curEquity,
    };

    this.updateMetrics(this.currentAccount, positions.length, totalLots);

    if (this.activeTab === 'positions') {
      this.renderPositions(positions);
    }
    this.updateBadges();
    this.updateBulkButton();
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
      this.currentPositions = positions;
      if (this.onPositionsUpdated) {
        this.onPositionsUpdated(positions);
      }

      // 2. Fetch Pending Orders (for accurate badge count)
      const ordRes = await this.bridge.callJson<{ ok: boolean; data?: any[] }>(
        'getPendingOrders',
        {},
      );
      const orders = ordRes.ok && Array.isArray(ordRes.data) ? ordRes.data : [];
      this.currentOrders = orders;

      // 3. Fetch Account Summary
      const accRes = await this.bridge.callJson<{ ok: boolean; data?: AccountSummary }>(
        'getAccountSummary',
        { is_demo: isDemo },
      );
      if (accRes.ok && accRes.data) {
        const acc = accRes.data;
        this.currentAccount = acc;
        if (this.onAccountSummaryUpdated) {
          this.onAccountSummaryUpdated(acc);
        }
        const totalLots = positions.reduce((sum, p) => sum + (p.quantity || 0), 0);
        this.updateMetrics(acc, positions.length, totalLots);
        this.renderAccountCards(acc);
      }

      // 4. Render active tab
      if (this.activeTab === 'positions') {
        this.renderPositions(positions);
      } else if (this.activeTab === 'orders') {
        this.renderOrders(orders);
      } else if (this.activeTab === 'journal') {
        const jrnRes = await this.bridge.callJson<{ ok: boolean; data?: TradeRecord[] }>(
          'getTradeJournal',
          { is_demo: isDemo },
        );
        const records = jrnRes.ok && Array.isArray(jrnRes.data) ? jrnRes.data : [];
        this.currentJournal = records;
        this.renderJournal(records);
      }

      this.updateBadges();
      this.updateBulkButton();
    } catch {
      /* ignore */
    }
  }

  private updateMetrics(acc: AccountSummary, activePosCount: number, totalLots: number): void {
    const balEl = this.container.querySelector('#metric-bal');
    const eqEl = this.container.querySelector('#metric-eq');
    const pnlEl = this.container.querySelector('#metric-pnl');
    const freeEl = this.container.querySelector('#metric-free');
    const pill = this.container.querySelector('#account-pill');

    const bal = acc.balance ?? 10000;
    const eq = acc.equity ?? 10000;
    const pnl = acc.unrealized_pnl ?? 0;
    const free = acc.free_margin ?? 10000;

    if (balEl) balEl.textContent = `$${bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (eqEl) eqEl.textContent = `$${eq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (freeEl) freeEl.textContent = `$${free.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (pnlEl) {
      const pnlPrefix = pnl > 0 ? '+' : '';
      const pnlPct = bal > 0 ? (pnl / bal) * 100 : 0;
      pnlEl.textContent = `${pnlPrefix}$${pnl.toFixed(2)} (${pnlPrefix}${pnlPct.toFixed(2)}%)`;
      if (pnl > 0) {
        pnlEl.className = 'metric-val pnl-green';
      } else if (pnl < 0) {
        pnlEl.className = 'metric-val pnl-red';
      } else {
        pnlEl.className = 'metric-val pnl-zero';
      }
    }

    if (pill && typeof pill.setAttribute === 'function') {
      const activeStr =
        activePosCount > 0 ? ` | Active: ${activePosCount} Pos (${totalLots.toFixed(2)} Lots)` : '';
      pill.setAttribute(
        'data-account-string',
        `Balance: $${bal.toLocaleString()} | Equity: $${eq.toLocaleString()} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}${activeStr}`,
      );
    }
  }

  private updateBadges(): void {
    const posBadge = this.container.querySelector('#badge-positions');
    const ordBadge = this.container.querySelector('#badge-orders');
    const jrnBadge = this.container.querySelector('#badge-journal');

    if (posBadge) {
      posBadge.textContent = String(this.currentPositions.length);
      posBadge.classList.toggle('active-pos', this.currentPositions.length > 0);
    }
    if (ordBadge) {
      ordBadge.textContent = String(this.currentOrders.length);
      ordBadge.classList.toggle('active-ord', this.currentOrders.length > 0);
    }
    if (jrnBadge) {
      jrnBadge.textContent = String(this.currentJournal.length);
    }
  }

  private updateBulkButton(): void {
    const btn = this.container.querySelector<HTMLButtonElement>('#drawer-bulk-action-btn');
    if (!btn) return;

    if (this.activeTab === 'positions') {
      if (this.currentPositions.length > 0) {
        btn.style.display = 'inline-flex';
        btn.textContent = `Close All (${this.currentPositions.length})`;
        btn.title = 'Close all open positions at market price';
      } else {
        btn.style.display = 'none';
      }
    } else if (this.activeTab === 'orders') {
      if (this.currentOrders.length > 0) {
        btn.style.display = 'inline-flex';
        btn.textContent = `Cancel All (${this.currentOrders.length})`;
        btn.title = 'Cancel all resting pending orders';
      } else {
        btn.style.display = 'none';
      }
    } else {
      btn.style.display = 'none';
    }
  }

  private async handleBulkAction(): Promise<void> {
    const btn = this.container.querySelector<HTMLButtonElement>('#drawer-bulk-action-btn');
    if (!btn) return;
    btn.disabled = true;

    try {
      if (this.activeTab === 'positions') {
        const positionsToClose = [...this.currentPositions];
        for (const pos of positionsToClose) {
          await this.handleClosePosition(pos.position_id, pos.current_price);
        }
      } else if (this.activeTab === 'orders') {
        const ordersToCancel = [...this.currentOrders];
        for (const ord of ordersToCancel) {
          await this.handleCancelOrder(ord.order_id);
        }
      }
      await this.refresh();
    } finally {
      btn.disabled = false;
      this.updateBulkButton();
    }
  }

  private async handleAddBalance(amount: number, note: string): Promise<void> {
    // 1. Immediate optimistic UI update
    this.currentAccount.balance = Math.round((this.currentAccount.balance + amount) * 100) / 100;
    this.currentAccount.equity = Math.round((this.currentAccount.balance + this.currentAccount.unrealized_pnl) * 100) / 100;
    this.currentAccount.free_margin = Math.round((this.currentAccount.equity - this.currentAccount.margin_used) * 100) / 100;
    this.updateMetrics(this.currentAccount, this.currentPositions.length, 0);
    this.renderAccountCards(this.currentAccount);
    if (this.onAccountSummaryUpdated) {
      this.onAccountSummaryUpdated(this.currentAccount);
    }

    if (!this.bridge) {
      this.onToast?.(`💰 Added $${amount.toLocaleString()} to paper balance`);
      return;
    }

    try {
      const isDemo = this.authState ? this.authState.isDemo() : false;
      const token = this.authState?.getToken();

      if (token && !isDemo) {
        const res = await this.bridge.callJson<{ ok: boolean; data?: { balance: number } }>(
          'authAddBalance',
          { token, amount, note },
        );
        if (res?.ok && res.data?.balance !== undefined) {
          this.authState?.updateUser({ balance: res.data.balance });
          this.currentAccount.balance = res.data.balance;
          this.currentAccount.equity = Math.round((res.data.balance + this.currentAccount.unrealized_pnl) * 100) / 100;
          this.currentAccount.free_margin = Math.round((this.currentAccount.equity - this.currentAccount.margin_used) * 100) / 100;
          this.updateMetrics(this.currentAccount, this.currentPositions.length, 0);
          this.renderAccountCards(this.currentAccount);
          this.onAccountSummaryUpdated?.(this.currentAccount);
        }
        this.onToast?.(`💰 Added $${amount.toLocaleString()} to account balance`);
      } else {
        const res = await this.bridge.callJson<{ ok: boolean; data?: AccountSummary }>(
          'addAccountBalance',
          {
            amount,
            note,
            is_demo: isDemo,
          },
        );
        if (res?.ok && res.data?.balance !== undefined) {
          this.currentAccount = {
            ...this.currentAccount,
            ...res.data,
          };
          this.updateMetrics(this.currentAccount, this.currentPositions.length, 0);
          this.renderAccountCards(this.currentAccount);
          this.onAccountSummaryUpdated?.(this.currentAccount);
        }
        this.onToast?.(`💰 Added $${amount.toLocaleString()} to demo balance`);
      }
      await this.refresh();
    } catch (err: any) {
      this.onToast?.(`Deposit failed: ${err.message || 'unknown error'}`);
    }
  }

  private async handleResetBalance(initialBalance: number, clearJournal: boolean): Promise<void> {
    // 1. Immediate optimistic UI reset
    this.currentAccount.balance = initialBalance;
    this.currentAccount.equity = initialBalance;
    this.currentAccount.free_margin = initialBalance;
    this.currentAccount.unrealized_pnl = 0;
    this.currentPositions = [];
    this.updateMetrics(this.currentAccount, 0, 0);
    this.renderPositions([]);
    this.renderAccountCards(this.currentAccount);
    this.onAccountSummaryUpdated?.(this.currentAccount);

    if (!this.bridge) {
      this.onToast?.(`🔄 Paper balance reset to $${initialBalance.toLocaleString()}`);
      return;
    }

    try {
      const isDemo = this.authState ? this.authState.isDemo() : false;
      const token = this.authState?.getToken();

      if (token && !isDemo) {
        const res = await this.bridge.callJson<{ ok: boolean; data?: { balance: number } }>(
          'authResetAccount',
          { token, initial_balance: initialBalance, clear_journal: clearJournal },
        );
        if (res?.ok && res.data?.balance !== undefined) {
          this.authState?.updateUser({ balance: res.data.balance });
          this.currentAccount.balance = res.data.balance;
          this.currentAccount.equity = res.data.balance;
          this.currentAccount.free_margin = res.data.balance;
          this.updateMetrics(this.currentAccount, 0, 0);
          this.renderAccountCards(this.currentAccount);
          this.onAccountSummaryUpdated?.(this.currentAccount);
        }
        this.onToast?.(`🔄 Paper balance reset to $${initialBalance.toLocaleString()}`);
      } else {
        const res = await this.bridge.callJson<{ ok: boolean; data?: AccountSummary }>('resetAccount', {
          initial_balance: initialBalance,
          clear_journal: clearJournal,
          is_demo: isDemo,
        });
        if (res?.ok && res.data?.balance !== undefined) {
          this.currentAccount = {
            ...this.currentAccount,
            ...res.data,
          };
          this.updateMetrics(this.currentAccount, 0, 0);
          this.renderAccountCards(this.currentAccount);
          this.onAccountSummaryUpdated?.(this.currentAccount);
        }
        this.onToast?.(`🔄 Demo balance reset to $${initialBalance.toLocaleString()}`);
      }
      await this.refresh();
    } catch (err: any) {
      this.onToast?.(`Reset failed: ${err.message || 'unknown error'}`);
    }
  }

  private renderPositions(positions: PositionDefinition[]): void {
    const tbody = this.container.querySelector('#positions-tbody')!;
    if (positions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="session-empty">No open positions.</td></tr>';
      return;
    }

    tbody.innerHTML = positions
      .map((p) => {
        const isLong = p.side === 'LONG';
        const sideClass = isLong ? 'pos-long' : 'pos-short';
        const pnlVal = p.unrealized_pnl ?? 0;
        const pnlClass = pnlVal > 0 ? 'pnl-green' : pnlVal < 0 ? 'pnl-red' : 'pnl-zero';
        const lotsText = `${p.quantity.toFixed(2)} Lots`;
        const slDisplay = p.stop_loss !== undefined && p.stop_loss !== null && p.stop_loss > 0 ? p.stop_loss.toFixed(4) : '-';
        const tpDisplay = p.take_profit !== undefined && p.take_profit !== null && p.take_profit > 0 ? p.take_profit.toFixed(4) : '-';

        // Calculate pips displacement
        let pipsVal = p.pips;
        if (pipsVal === undefined) {
          const pipMult = p.symbol.toUpperCase().includes('JPY') ? 100 : 10000;
          const diff = isLong
            ? (p.current_price - p.entry_price)
            : (p.entry_price - p.current_price);
          pipsVal = diff * pipMult;
        }
        const pipsText = `${pipsVal >= 0 ? '+' : ''}${pipsVal.toFixed(1)}p`;
        const pipsClass = pipsVal > 0 ? 'pnl-green' : pipsVal < 0 ? 'pnl-red' : 'pnl-zero';

        const pctChange = p.entry_price > 0
          ? (isLong
              ? ((p.current_price - p.entry_price) / p.entry_price) * 100
              : ((p.entry_price - p.current_price) / p.entry_price) * 100)
          : 0;
        const pctStr = ` (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%)`;

        return `
          <tr data-id="${p.position_id}">
            <td><strong>${p.symbol}</strong></td>
            <td class="${sideClass}">${p.side}</td>
            <td><strong>${lotsText}</strong></td>
            <td>${p.entry_price.toFixed(4)}</td>
            <td>${p.current_price.toFixed(4)}</td>
            <td class="editable-cell sl-cell" title="Click or double-click to edit SL">
              <span class="cell-val">${slDisplay}</span>
              <span class="cell-pencil-btn" title="Edit SL">${getIcon('pencil')}</span>
            </td>
            <td class="editable-cell tp-cell" title="Click or double-click to edit TP">
              <span class="cell-val">${tpDisplay}</span>
              <span class="cell-pencil-btn" title="Edit TP">${getIcon('pencil')}</span>
            </td>
            <td class="${pnlClass}">${pnlVal >= 0 ? '+' : ''}$${pnlVal.toFixed(2)}${pctStr}</td>
            <td class="pips-cell ${pipsClass}"><strong>${pipsText}</strong></td>
            <td class="action-cell">
              <div class="micro-action-group">
                <button type="button" class="drawer-action-btn micro-action-btn modify-pos-btn" data-id="${p.position_id}" title="Modify SL / TP Targets">${getIcon('target')}</button>
                <button type="button" class="drawer-action-btn micro-action-btn partial-pos-btn" data-id="${p.position_id}" data-price="${p.current_price}" title="Partial Close Position">${getIcon('scissors')}</button>
                <button type="button" class="drawer-action-btn micro-action-btn close-pos-btn danger-hover" data-id="${p.position_id}" data-price="${p.current_price}" title="Close Position at Market">${getIcon('close')}</button>
              </div>
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
      const handleEdit = (ev: Event) => {
        ev.stopPropagation();
        const tr = (cell as HTMLElement).closest('tr');
        const id = tr?.dataset.id;
        const pos = positions.find((item) => item.position_id === id);
        if (pos && this.onModifySlTp) {
          this.onModifySlTp(pos);
        }
      };
      cell.addEventListener('click', handleEdit);
      cell.addEventListener('dblclick', handleEdit);
    });
  }

  private renderOrders(orders: any[]): void {
    const tbody = this.container.querySelector('#orders-tbody')!;
    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="session-empty">No pending orders.</td></tr>';
      return;
    }

    tbody.innerHTML = orders
      .map((o) => {
        const lotsText = `${typeof o.quantity === 'number' ? o.quantity.toFixed(2) : o.quantity} Lots`;
        const orderTypeUpper = String(o.order_type || 'LIMIT').toUpperCase();
        let typeClass = 'type-limit';
        if (orderTypeUpper.includes('STOP')) typeClass = 'type-stop';
        else if (orderTypeUpper.includes('MARKET')) typeClass = 'type-market';

        let triggerPriceDisplay = typeof o.price === 'number' ? o.price.toFixed(4) : (o.price ?? '-');
        if (typeof o.price === 'number' && typeof o.current_price === 'number' && o.current_price > 0) {
          const isBuy = o.side === 'BUY' || o.side === 'LONG';
          const pipMult = String(o.symbol || '').toUpperCase().includes('JPY') ? 100 : 10000;
          const distPips = (isBuy ? (o.price - o.current_price) : (o.current_price - o.price)) * pipMult;
          triggerPriceDisplay = `${o.price.toFixed(4)} (${distPips >= 0 ? '+' : ''}${distPips.toFixed(0)}p)`;
        }
        const currentPriceDisplay = typeof o.current_price === 'number' ? o.current_price.toFixed(4) : (o.current_price ?? '-');
        const slDisplay = o.stop_loss !== undefined && o.stop_loss !== null && o.stop_loss > 0 ? (typeof o.stop_loss === 'number' ? o.stop_loss.toFixed(4) : o.stop_loss) : '-';
        const tpDisplay = o.take_profit !== undefined && o.take_profit !== null && o.take_profit > 0 ? (typeof o.take_profit === 'number' ? o.take_profit.toFixed(4) : o.take_profit) : '-';

        return `
          <tr>
            <td><strong>${o.symbol}</strong></td>
            <td class="${o.side === 'BUY' || o.side === 'LONG' ? 'pos-long' : 'pos-short'}">${o.side}</td>
            <td><span class="order-type-badge ${typeClass}">${o.order_type}</span></td>
            <td><strong>${lotsText}</strong></td>
            <td>${triggerPriceDisplay}</td>
            <td>${currentPriceDisplay}</td>
            <td>${slDisplay}</td>
            <td>${tpDisplay}</td>
            <td><button type="button" class="drawer-action-btn cancel-ord-btn danger-hover" data-id="${o.order_id}" title="Cancel Pending Order">✕ Cancel</button></td>
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

    // Calculate performance KPIs
    const totalTrades = records.length;
    const winningTrades = records.filter((r) => (r.pnl ?? 0) > 0);
    const losingTrades = records.filter((r) => (r.pnl ?? 0) < 0);
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
    const netPnl = records.reduce((sum, r) => sum + (r.pnl ?? 0), 0);
    const grossProfit = winningTrades.reduce((sum, r) => sum + (r.pnl ?? 0), 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, r) => sum + (r.pnl ?? 0), 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0.00';
    const bestPnl = totalTrades > 0 ? Math.max(0, ...records.map((r) => r.pnl ?? 0)) : 0;

    const tradesValEl = this.container.querySelector('#perf-trades-val');
    const winRateValEl = this.container.querySelector('#perf-winrate-val');
    const netPnlValEl = this.container.querySelector('#perf-netpnl-val');
    const pfValEl = this.container.querySelector('#perf-pf-val');
    const bestValEl = this.container.querySelector('#perf-best-val');

    if (tradesValEl) tradesValEl.textContent = String(totalTrades);
    if (winRateValEl) {
      winRateValEl.textContent = `${winRate.toFixed(1)}%`;
      winRateValEl.className = `perf-val ${winRate >= 50 ? 'pnl-green' : winRate > 0 ? 'pnl-red' : ''}`;
    }
    if (netPnlValEl) {
      netPnlValEl.textContent = `${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}`;
      netPnlValEl.className = `perf-val ${netPnl > 0 ? 'pnl-green' : netPnl < 0 ? 'pnl-red' : 'pnl-zero'}`;
    }
    if (pfValEl) pfValEl.textContent = profitFactor;
    if (bestValEl) bestValEl.textContent = `+$${bestPnl.toFixed(2)}`;

    // Filter closed trade records
    let displayRecords = records;
    if (this.journalFilter === 'wins') {
      displayRecords = records.filter((r) => (r.pnl ?? 0) > 0);
    } else if (this.journalFilter === 'losses') {
      displayRecords = records.filter((r) => (r.pnl ?? 0) <= 0);
    }

    const tbody = this.container.querySelector('#journal-tbody')!;
    if (displayRecords.length === 0) {
      const emptyMsg = this.journalFilter === 'all'
        ? 'No closed trades recorded.'
        : `No ${this.journalFilter} recorded.`;
      tbody.innerHTML = `<tr><td colspan="10" class="session-empty">${emptyMsg}</td></tr>`;
      return;
    }

    tbody.innerHTML = displayRecords
      .map((r) => {
        const pnlVal = r.pnl ?? 0;
        const pnlClass = pnlVal > 0 ? 'pnl-green' : pnlVal < 0 ? 'pnl-red' : 'pnl-zero';
        const exitTimestamp = r.closed_at ?? r.opened_at ?? Date.now() / 1000;
        const dateStr = new Date(exitTimestamp * 1000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        const holdSecs = Math.max(0, (r.closed_at || 0) - (r.opened_at || 0));
        let holdStr = '-';
        if (r.closed_at && r.opened_at && holdSecs > 0) {
          const h = Math.floor(holdSecs / 3600);
          const m = Math.floor((holdSecs % 3600) / 60);
          holdStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
        }

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
          <td class="hold-cell">${holdStr}</td>
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
    const realizedPnl = acc.realized_pnl ?? 0;
    const marginUsed = acc.margin_used ?? 0;
    const freeMargin = acc.free_margin ?? 0;
    const pnlColor = unrealizedPnl > 0 ? '#089981' : unrealizedPnl < 0 ? '#f23645' : '#ffffff';
    const realizedColor = realizedPnl > 0 ? '#089981' : realizedPnl < 0 ? '#f23645' : '#ffffff';
    const marginLevel = marginUsed > 0 ? (equity / marginUsed) * 100 : 0;
    const totalTrades = acc.total_trades ?? this.currentJournal.length;
    const winRate = acc.win_rate ?? 0;
    const marginUsedPct = equity > 0 ? Math.min(100, Math.max(0, (marginUsed / equity) * 100)) : 0;
    const winRatePct = Math.min(100, Math.max(0, winRate));

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
        <span class="account-card-label">Unrealized P&L</span>
        <span class="account-card-val" style="color: ${pnlColor}">${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)}</span>
      </div>
      <div class="account-card">
        <span class="account-card-label">Realized P&L</span>
        <span class="account-card-val" style="color: ${realizedColor}">${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)}</span>
      </div>
      <div class="account-card">
        <span class="account-card-label">Margin Used</span>
        <span class="account-card-val">$${marginUsed.toFixed(2)}</span>
        <div class="card-progress-bar" title="Margin Utilization: ${marginUsedPct.toFixed(1)}%"><div class="card-progress-fill ${marginUsedPct > 80 ? 'fill-red' : marginUsedPct > 50 ? 'fill-amber' : 'fill-blue'}" style="width: ${marginUsedPct.toFixed(1)}%"></div></div>
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
        <span class="account-card-label">Win Rate (${totalTrades} Trd)</span>
        <span class="account-card-val">${winRate.toFixed(1)}%</span>
        <div class="card-progress-bar" title="Win Rate: ${winRate.toFixed(1)}%"><div class="card-progress-fill fill-green" style="width: ${winRatePct.toFixed(1)}%"></div></div>
      </div>
    `;
  }

  private exportJournalCsv(records: TradeRecord[]): void {
    if (!records || records.length === 0) {
      this.onToast?.('No closed trades to export');
      return;
    }
    const headers = ['Time', 'Symbol', 'Side', 'Volume', 'Entry Price', 'Exit Price', 'PnL ($)', 'PnL (%)', 'Reason'];
    const rows = records.map((r) => {
      const exitTimestamp = r.closed_at ?? r.opened_at ?? Date.now() / 1000;
      const dateStr = new Date(exitTimestamp * 1000).toISOString();
      return [
        dateStr,
        r.symbol,
        r.side,
        r.quantity.toFixed(2),
        r.entry_price.toFixed(4),
        r.exit_price.toFixed(4),
        (r.pnl ?? 0).toFixed(2),
        (r.pnl_percent ?? 0).toFixed(2),
        r.exit_reason || 'MANUAL',
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `trade-journal-${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch {
        /* ignore in test/headless environments without objectURL */
      }
    }
    this.onToast?.(`📥 Exported ${records.length} closed trades to CSV`);
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

  destroy(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
    this.capitalManager.destroy();
    this.container.remove();
  }
}
