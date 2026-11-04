/**
 * User Navigation Widget for the Header Bar.
 * Displays authentication status, demo mode pill, account balance, and account dropdown.
 */

import type { PythonBridge } from '../bridge/python-bridge';
import type { AuthStateManager, UserProfile, TradingMode } from '../auth/auth-state';
import { getIcon } from './icons';
import type { AuthModal } from './auth-modal';

export class UserNavWidget {
  private readonly element: HTMLElement;
  private menuOpen = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly authState: AuthStateManager,
    private readonly authModal: AuthModal,
    private readonly bridge: PythonBridge | null,
    private readonly onToast?: (msg: string) => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'user-nav-widget';
    const statusPill = this.container.querySelector('.status-pill-wrap');
    if (statusPill) {
      this.container.insertBefore(this.element, statusPill);
    } else {
      this.container.appendChild(this.element);
    }

    this.authState.subscribe((mode, user) => {
      this.render(mode, user);
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (this.menuOpen && !this.element.contains(e.target as Node)) {
        this.closeMenu();
      }
    });
  }

  private render(mode: TradingMode, user: UserProfile | null): void {
    this.menuOpen = false;
    this.element.innerHTML = '';

    if (mode === 'authenticated' && user) {
      this.renderAuthenticated(user);
    } else if (mode === 'demo') {
      this.renderDemo();
    } else {
      this.renderGuest();
    }
  }

  private renderGuest(): void {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'header-btn user-nav-signin-btn';
    btn.title = 'Sign in or register to save paper trade history';
    btn.innerHTML = `
      ${getIcon('user')}
      <span>Sign In</span>
    `;
    btn.addEventListener('click', () => {
      this.authModal.show({ initialTab: 'login' });
    });
    this.element.appendChild(btn);
  }

  private renderDemo(): void {
    const wrap = document.createElement('div');
    wrap.className = 'user-nav-demo-wrap';
    wrap.innerHTML = `
      <div class="user-nav-demo-badge" title="Temporary Demo Session: Trades are simulated in memory with zero database writes">
        <span class="demo-pulse-dot"></span>
        <span class="demo-badge-text">Demo Mode</span>
      </div>
      <button type="button" class="header-btn user-nav-signin-btn" id="demo-signin-btn" title="Sign in to save paper trades">
        ${getIcon('user')}
        <span>Sign In</span>
      </button>
    `;

    wrap.querySelector('#demo-signin-btn')?.addEventListener('click', () => {
      this.authModal.show({
        initialTab: 'register',
        bannerMessage: 'Create an account to keep and analyze your paper trade history permanently.',
      });
    });

    this.element.appendChild(wrap);
  }

  private renderAuthenticated(user: UserProfile): void {
    const formattedBalance = Number(user.balance || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const wrap = document.createElement('div');
    wrap.className = 'user-nav-dropdown-wrap';
    wrap.innerHTML = `
      <button type="button" class="header-btn user-nav-profile-btn" id="user-profile-menu-btn" title="Account Menu">
        <span class="user-avatar-badge">${getIcon('user')}</span>
        <span class="user-nav-name">${this.escapeHtml(user.username)}</span>
        <span class="user-nav-balance">$${formattedBalance}</span>
        <span class="user-nav-arrow">${getIcon('chevron_down')}</span>
      </button>

      <div class="user-nav-menu" id="user-profile-menu" style="display: none;">
        <div class="user-nav-menu-header">
          <div class="menu-user-id">${this.escapeHtml(user.username)}</div>
          <div class="menu-user-email">${this.escapeHtml(user.email || 'paper trader')}</div>
        </div>

        <div class="user-nav-menu-divider"></div>

        <button type="button" class="user-menu-item" id="menu-view-stats">
          ${getIcon('history')}
          <span>Account Stats & Win Rate</span>
        </button>

        <button type="button" class="user-menu-item" id="menu-reset-balance">
          ${getIcon('refresh')}
          <span>Reset Paper Balance ($10,000)</span>
        </button>

        <button type="button" class="user-menu-item" id="menu-switch-demo">
          ${getIcon('flask')}
          <span>Switch to Demo Session</span>
        </button>

        <div class="user-nav-menu-divider"></div>

        <button type="button" class="user-menu-item text-danger" id="menu-sign-out">
          ${getIcon('log_out')}
          <span>Sign Out</span>
        </button>
      </div>
    `;

    const menuBtn = wrap.querySelector<HTMLButtonElement>('#user-profile-menu-btn')!;
    const menu = wrap.querySelector<HTMLElement>('#user-profile-menu')!;

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu(menu);
    });

    wrap.querySelector('#menu-view-stats')?.addEventListener('click', async () => {
      this.closeMenu();
      await this.showStatsDialog(user);
    });

    wrap.querySelector('#menu-reset-balance')?.addEventListener('click', async () => {
      this.closeMenu();
      await this.handleResetBalance();
    });

    wrap.querySelector('#menu-switch-demo')?.addEventListener('click', () => {
      this.closeMenu();
      this.authState.setDemoMode();
      if (this.onToast) this.onToast('Switched to Instant Demo Mode (unsaved)');
    });

    wrap.querySelector('#menu-sign-out')?.addEventListener('click', async () => {
      this.closeMenu();
      await this.authState.signOut();
      if (this.onToast) this.onToast('Signed out successfully');
    });

    this.element.appendChild(wrap);
  }

  private toggleMenu(menu: HTMLElement): void {
    if (this.menuOpen) {
      this.closeMenu();
    } else {
      menu.style.display = 'block';
      this.menuOpen = true;
    }
  }

  private closeMenu(): void {
    const menu = this.element.querySelector<HTMLElement>('#user-profile-menu');
    if (menu) {
      menu.style.display = 'none';
      this.menuOpen = false;
    }
  }

  private async handleResetBalance(): Promise<void> {
    const confirmed = window.confirm(
      'Reset your paper trading account balance to $10,000.00? Your closed trade history will remain intact.',
    );
    if (!confirmed) return;

    try {
      if (this.bridge) {
        const res = await this.bridge.callJson<{ ok: boolean; data?: { balance: number } }>(
          'authResetAccount',
          { initial_balance: 10000.0 },
        );
        if (res.ok && res.data) {
          this.authState.updateUser({ balance: res.data.balance });
          if (this.onToast) this.onToast('Account balance reset to $10,000.00');
          return;
        }
      }

      // Cloud API fallback
      const token = this.authState.getToken();
      const r = await fetch('/api/auth/reset-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ initial_balance: 10000.0 }),
      });
      const data = await r.json();
      if (data.ok && data.data) {
        this.authState.updateUser({ balance: data.data.balance });
        if (this.onToast) this.onToast('Account balance reset to $10,000.00');
      }
    } catch (err: any) {
      if (this.onToast) this.onToast(`Reset failed: ${err.message}`);
    }
  }

  private async showStatsDialog(user: UserProfile): Promise<void> {
    let stats = {
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0.0,
      total_pnl: 0.0,
      profit_factor: 0.0,
      max_drawdown: 0.0,
    };

    try {
      if (this.bridge) {
        const res = await this.bridge.callJson<{ ok: boolean; data?: typeof stats }>(
          'authGetUserStats',
          {},
        );
        if (res.ok && res.data) {
          stats = res.data;
        }
      } else {
        const token = this.authState.getToken();
        const r = await fetch('/api/auth/stats', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const d = await r.json();
        if (d.ok && d.data) {
          stats = d.data;
        }
      }
    } catch {
      /* ignore */
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card stats-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="auth-icon-badge">${getIcon('history')}</span>
            <div>
              <h2 class="modal-title">${this.escapeHtml(user.username)}'s Performance</h2>
              <p class="modal-subtitle">Aggregated metrics from your permanent SQLite trade journal</p>
            </div>
          </div>
          <button type="button" class="modal-close-btn" id="stats-close-btn">${getIcon('close')}</button>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Current Balance</span>
            <span class="stat-val">$${Number(user.balance || 0).toFixed(2)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Win Rate</span>
            <span class="stat-val ${stats.win_rate >= 50 ? 'val-green' : stats.win_rate > 0 ? 'val-yellow' : ''}">${stats.win_rate.toFixed(1)}%</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Total Trades</span>
            <span class="stat-val">${stats.total_trades} (${stats.winning_trades}W / ${stats.losing_trades}L)</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Total Net PnL</span>
            <span class="stat-val ${stats.total_pnl >= 0 ? 'val-green' : 'val-red'}">${stats.total_pnl >= 0 ? '+' : ''}$${stats.total_pnl.toFixed(2)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Profit Factor</span>
            <span class="stat-val">${stats.profit_factor ? stats.profit_factor.toFixed(2) : '--'}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Max Drawdown</span>
            <span class="stat-val val-red">${stats.max_drawdown ? stats.max_drawdown.toFixed(1) + '%' : '0.0%'}</span>
          </div>
        </div>

        <div class="modal-footer stats-footer">
          <button type="button" class="btn-primary stats-dismiss-btn" id="stats-dismiss-btn">Close</button>
        </div>
      </div>
    `;

    const close = () => modal.remove();
    modal.querySelector('#stats-close-btn')?.addEventListener('click', close);
    modal.querySelector('#stats-dismiss-btn')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.body.appendChild(modal);
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
