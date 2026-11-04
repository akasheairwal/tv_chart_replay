/**
 * Paper Trading Mode Selection Dialog.
 * Displays a choice when an unauthenticated guest attempts to place an order:
 * 1. Track & Save Trade History (Free Account - Permanent SQLite Storage)
 * 2. Instant Demo Preview (No Sign-Up - Ephemeral In-Memory Storage)
 */

import { getIcon } from './icons';

export interface PaperTradingModeOptions {
  onSelectAccount: () => void;
  onSelectDemo: () => void;
  onCancel?: () => void;
}

export class PaperTradingModeDialog {
  private overlay: HTMLElement | null = null;
  private options: PaperTradingModeOptions | null = null;

  constructor(private readonly parent: HTMLElement = document.body) {}

  show(options: PaperTradingModeOptions): void {
    this.options = options;
    if (this.overlay) {
      this.close();
    }
    this.overlay = this.render();
    this.parent.appendChild(this.overlay);

    // Trap Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', handleKeyDown);
        this.cancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
  }

  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private cancel(): void {
    const cb = this.options?.onCancel;
    this.close();
    if (cb) cb();
  }

  private render(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay mode-selection-overlay';

    overlay.innerHTML = `
      <div class="modal-card mode-selection-modal" role="dialog" aria-modal="true" aria-labelledby="mode-dialog-title">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="mode-icon-badge">${getIcon('trade')}</span>
            <div>
              <h2 id="mode-dialog-title" class="modal-title">Paper Trading Mode</h2>
              <p class="modal-subtitle">Choose how your paper trade execution and journal history are handled</p>
            </div>
          </div>
          <button type="button" class="modal-close-btn" id="mode-modal-close" title="Close">${getIcon('close')}</button>
        </div>

        <div class="mode-cards-container">
          <!-- Card 1: Track & Save Trade History -->
          <div class="mode-card mode-card-account" id="mode-choose-account">
            <div class="mode-card-badge mode-badge-primary">
              ${getIcon('sparkles')}
              <span>Save History</span>
            </div>
            <div class="mode-card-icon-wrap primary-gradient">
              ${getIcon('history')}
            </div>
            <h3 class="mode-card-title">Track & Save Trade History</h3>
            <p class="mode-card-desc">Keep a permanent paper trading journal, track win rate, PnL, and analyze trade execution over time.</p>
            
            <ul class="mode-features-list">
              <li>
                <span class="check-icon">${getIcon('check')}</span>
                <span>Permanent SQLite journal storage</span>
              </li>
              <li>
                <span class="check-icon">${getIcon('check')}</span>
                <span>Multi-session performance & stats</span>
              </li>
              <li>
                <span class="check-icon">${getIcon('check')}</span>
                <span>Account balance reset & tracking</span>
              </li>
              <li>
                <span class="check-icon">${getIcon('check')}</span>
                <span>100% free · Sign in or register in 10s</span>
              </li>
            </ul>

            <button type="button" class="mode-card-action-btn btn-primary" id="mode-account-btn">
              <span>Sign In / Create Free Account</span>
              ${getIcon('chevron_right')}
            </button>
          </div>

          <!-- Card 2: Instant Demo Preview -->
          <div class="mode-card mode-card-demo" id="mode-choose-demo">
            <div class="mode-card-badge mode-badge-demo">
              ${getIcon('flask')}
              <span>Instant Demo</span>
            </div>
            <div class="mode-card-icon-wrap demo-gradient">
              ${getIcon('lightning')}
            </div>
            <h3 class="mode-card-title">Instant Demo Preview</h3>
            <p class="mode-card-desc">Execute paper orders immediately with zero sign-up. In-memory demo simulation for quick testing.</p>
            
            <ul class="mode-features-list">
              <li>
                <span class="check-icon">${getIcon('check')}</span>
                <span>Instant paper order execution</span>
              </li>
              <li>
                <span class="check-icon">${getIcon('check')}</span>
                <span>No sign-up or credentials needed</span>
              </li>
              <li>
                <span class="check-icon check-muted">${getIcon('shield')}</span>
                <span class="feature-muted"><strong>Zero DB writes</strong> — history not saved</span>
              </li>
              <li>
                <span class="check-icon check-muted">${getIcon('history')}</span>
                <span class="feature-muted">Trades erase when tab / session resets</span>
              </li>
            </ul>

            <button type="button" class="mode-card-action-btn btn-secondary" id="mode-demo-btn">
              <span>Continue in Demo Mode</span>
              ${getIcon('chevron_right')}
            </button>
          </div>
        </div>

        <div class="mode-dialog-footer">
          <span class="mode-footer-hint">You can change your mode or create an account at any time from the top bar.</span>
        </div>
      </div>
    `;

    // Backdrop click dismisses
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.cancel();
      }
    });

    overlay.querySelector('#mode-modal-close')?.addEventListener('click', () => {
      this.cancel();
    });

    overlay.querySelector('#mode-account-btn')?.addEventListener('click', () => {
      const cb = this.options?.onSelectAccount;
      this.close();
      if (cb) cb();
    });

    overlay.querySelector('#mode-choose-account')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const cb = this.options?.onSelectAccount;
      this.close();
      if (cb) cb();
    });

    overlay.querySelector('#mode-demo-btn')?.addEventListener('click', () => {
      const cb = this.options?.onSelectDemo;
      this.close();
      if (cb) cb();
    });

    overlay.querySelector('#mode-choose-demo')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const cb = this.options?.onSelectDemo;
      this.close();
      if (cb) cb();
    });

    return overlay;
  }
}

