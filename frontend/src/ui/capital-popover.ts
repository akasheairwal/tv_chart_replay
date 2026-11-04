/**
 * Capital Management Popover Components (Phase 2 / ADR 0010)
 *
 * Provides anchored TradingView-styled popovers for:
 * 1. AddBalancePopover: Quick paper deposits (+$500, +$1k, +$5k, +$10k, +$50k),
 *    custom amount input, live new balance preview, optional note.
 * 2. ResetBalancePopover: Target starting capital baselines ($1k, $5k, $10k, $25k, $50k, $100k),
 *    custom baseline input, clear trade journal toggle, safety warning.
 * 3. CapitalPopoverManager: Orchestrates popover lifecycle, ensuring single-instance display.
 */

import { getIcon } from './icons';
import {
  positionPopoverAbove,
  attachPopoverDismissal,
  type PopoverBinding,
} from './popover-utils';

export interface AddBalanceOptions {
  /** Anchor element to which popover is geometrically anchored */
  anchorEl: HTMLElement;
  /** Current account balance to compute real-time new total */
  currentBalance: number;
  /** Callback fired upon deposit confirmation */
  onConfirm: (amount: number, note: string) => Promise<void> | void;
  /** Callback fired on user cancellation or outside dismissal */
  onCancel?: () => void;
  /** Preset chip amounts in dollars. Default: [500, 1000, 5000, 10000, 50000] */
  presetAmounts?: number[];
  /** Default selected deposit amount. Default: 5000 */
  defaultAmount?: number;
}

export interface ResetBalanceOptions {
  /** Anchor element to which popover is geometrically anchored */
  anchorEl: HTMLElement;
  /** Current account balance for display */
  currentBalance: number;
  /** Callback fired upon reset confirmation */
  onConfirm: (initialBalance: number, clearJournal: boolean) => Promise<void> | void;
  /** Callback fired on user cancellation or outside dismissal */
  onCancel?: () => void;
  /** Preset baseline chips in dollars. Default: [1000, 5000, 10000, 25000, 50000, 100000] */
  presetBaselines?: number[];
  /** Default selected baseline. Default: 10000 */
  defaultBaseline?: number;
}

function formatMoney(val: number): string {
  const num = typeof val === 'number' && !isNaN(val) ? val : 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatChipAmount(val: number): string {
  return val.toLocaleString('en-US');
}

/**
 * Anchored popover for depositing funds into paper trading account.
 */
export class AddBalancePopover {
  private readonly el: HTMLElement;
  private readonly dismissalBinding: PopoverBinding;
  private isDestroyed = false;
  private amountInput!: HTMLInputElement;
  private noteInput!: HTMLInputElement;
  private confirmBtn!: HTMLButtonElement;
  private newTotalEl!: HTMLElement;
  private chipBtns: HTMLButtonElement[] = [];

  constructor(
    private readonly options: AddBalanceOptions,
    private readonly onClosed?: () => void,
  ) {
    this.el = this.render();
    document.body.appendChild(this.el);

    this.setupInteractivity();

    // Position above anchor element
    positionPopoverAbove(this.options.anchorEl, this.el, {
      fallbackWidth: 320,
      fallbackHeight: 320,
      offsetY: 6,
      placement: 'above',
    });

    // Attach click-outside, Escape, and resize dismissal
    this.dismissalBinding = attachPopoverDismissal({
      popupEl: this.el,
      anchorEl: this.options.anchorEl,
      onDismiss: () => {
        this.destroy();
        this.options.onCancel?.();
      },
      onReposition: () => {
        positionPopoverAbove(this.options.anchorEl, this.el, {
          fallbackWidth: 320,
          fallbackHeight: 320,
          offsetY: 6,
          placement: 'above',
        });
      },
      restoreFocus: true,
    });
  }

  private render(): HTMLElement {
    const pop = document.createElement('div');
    pop.className = 'tv-capital-popover add-balance-popup';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.setAttribute('aria-labelledby', 'add-capital-title');

    const presets = this.options.presetAmounts || [500, 1000, 5000, 10000, 50000];
    const defaultAmt = this.options.defaultAmount ?? 5000;
    const curBal = this.options.currentBalance || 0;
    const initialNewTotal = curBal + defaultAmt;

    const chipsHtml = presets
      .map(
        (amt) => `
        <button type="button" class="capital-chip-btn ${amt === defaultAmt ? 'active' : ''}" data-amount="${amt}">
          +$${formatChipAmount(amt)}
        </button>
      `,
      )
      .join('');

    pop.innerHTML = `
      <div class="capital-popover-header">
        <div class="capital-popover-title" id="add-capital-title">
          <span class="capital-title-icon">${getIcon('plus')}</span>
          <span>Add Paper Balance</span>
        </div>
        <button type="button" class="capital-popover-close" id="add-capital-close-btn" aria-label="Close dialog" title="Close (Escape)">
          ${getIcon('close')}
        </button>
      </div>

      <div class="capital-balance-preview">
        <div>
          <span class="capital-preview-label">Current: </span>
          <span class="capital-preview-val" id="capital-cur-balance">$${formatMoney(curBal)}</span>
        </div>
        <div>
          <span class="capital-preview-label">New Total: </span>
          <span class="capital-preview-val capital-preview-new" id="capital-new-total">$${formatMoney(initialNewTotal)}</span>
        </div>
      </div>

      <div class="capital-field-wrap">
        <label class="capital-field-label">Quick Deposit Amounts</label>
        <div class="capital-chip-grid" id="deposit-chips">
          ${chipsHtml}
        </div>
      </div>

      <div class="capital-field-wrap">
        <label class="capital-field-label" for="capital-deposit-input">Custom Deposit Amount</label>
        <div class="capital-input-currency-wrap">
          <span class="capital-currency-symbol">$</span>
          <input
            type="number"
            id="capital-deposit-input"
            class="capital-number-input"
            min="1"
            step="any"
            value="${defaultAmt}"
            placeholder="0.00"
          />
        </div>
      </div>

      <div class="capital-field-wrap">
        <label class="capital-field-label" for="capital-deposit-note">Note / Purpose (Optional)</label>
        <input
          type="text"
          id="capital-deposit-note"
          class="capital-text-input"
          placeholder="e.g. Backtest deposit, Phase 2 evaluation"
          maxlength="60"
        />
      </div>

      <div class="capital-actions-row">
        <button type="button" class="capital-btn capital-cancel-btn" id="add-capital-cancel-btn">Cancel</button>
        <button type="button" class="capital-btn capital-confirm-btn" id="capital-deposit-confirm">
          Confirm Deposit (+$${formatChipAmount(defaultAmt)})
        </button>
      </div>
    `;

    return pop;
  }

  private setupInteractivity(): void {
    this.amountInput = this.el.querySelector<HTMLInputElement>('#capital-deposit-input')!;
    this.noteInput = this.el.querySelector<HTMLInputElement>('#capital-deposit-note')!;
    this.confirmBtn = this.el.querySelector<HTMLButtonElement>('#capital-deposit-confirm')!;
    this.newTotalEl = this.el.querySelector<HTMLElement>('#capital-new-total')!;
    this.chipBtns = Array.from(this.el.querySelectorAll<HTMLButtonElement>('.capital-chip-btn'));

    // Chip click handlers
    this.chipBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const amt = parseFloat(btn.dataset.amount || '0');
        this.amountInput.value = String(amt);
        this.updateState();
        this.amountInput.focus();
      });
    });

    // Custom amount input listener
    this.amountInput.addEventListener('input', () => {
      this.updateState();
    });

    // Enter submits
    this.amountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleConfirm();
      }
    });

    this.noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleConfirm();
      }
    });

    // Close button
    this.el.querySelector('#add-capital-close-btn')?.addEventListener('click', () => {
      this.destroy();
      this.options.onCancel?.();
    });

    // Cancel button
    this.el.querySelector('#add-capital-cancel-btn')?.addEventListener('click', () => {
      this.destroy();
      this.options.onCancel?.();
    });

    // Confirm button
    this.confirmBtn.addEventListener('click', () => {
      void this.handleConfirm();
    });

    // Auto focus amount input
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.amountInput.select();
      }
    }, 20);
  }

  private updateState(): void {
    const rawVal = parseFloat(this.amountInput.value.trim());
    const isValid = !isNaN(rawVal) && rawVal > 0;

    // Highlight matching chip
    this.chipBtns.forEach((btn) => {
      const chipAmt = parseFloat(btn.dataset.amount || '0');
      btn.classList.toggle('active', isValid && chipAmt === rawVal);
    });

    if (isValid) {
      const curBal = this.options.currentBalance || 0;
      const newTotal = curBal + rawVal;
      this.newTotalEl.textContent = `$${formatMoney(newTotal)}`;
      this.confirmBtn.disabled = false;
      this.confirmBtn.textContent = `Confirm Deposit (+$${formatChipAmount(rawVal)})`;
    } else {
      this.newTotalEl.textContent = '--';
      this.confirmBtn.disabled = true;
      this.confirmBtn.textContent = 'Enter Positive Amount';
    }
  }

  private async handleConfirm(): Promise<void> {
    const rawVal = parseFloat(this.amountInput.value.trim());
    if (isNaN(rawVal) || rawVal <= 0) return;

    const note = this.noteInput.value.trim();
    this.confirmBtn.disabled = true;
    this.confirmBtn.textContent = 'Depositing...';

    try {
      await this.options.onConfirm(rawVal, note);
      this.destroy();
    } catch {
      this.confirmBtn.disabled = false;
      this.updateState();
    }
  }

  getElement(): HTMLElement {
    return this.el;
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.dismissalBinding.destroy();
    this.el.remove();
    this.onClosed?.();
  }
}

/**
 * Anchored popover for resetting paper trading account starting capital.
 */
export class ResetBalancePopover {
  private readonly el: HTMLElement;
  private readonly dismissalBinding: PopoverBinding;
  private isDestroyed = false;
  private baselineInput!: HTMLInputElement;
  private clearJournalCheckbox!: HTMLInputElement;
  private confirmBtn!: HTMLButtonElement;
  private chipBtns: HTMLButtonElement[] = [];

  constructor(
    private readonly options: ResetBalanceOptions,
    private readonly onClosed?: () => void,
  ) {
    this.el = this.render();
    document.body.appendChild(this.el);

    this.setupInteractivity();

    positionPopoverAbove(this.options.anchorEl, this.el, {
      fallbackWidth: 320,
      fallbackHeight: 330,
      offsetY: 6,
      placement: 'above',
    });

    this.dismissalBinding = attachPopoverDismissal({
      popupEl: this.el,
      anchorEl: this.options.anchorEl,
      onDismiss: () => {
        this.destroy();
        this.options.onCancel?.();
      },
      onReposition: () => {
        positionPopoverAbove(this.options.anchorEl, this.el, {
          fallbackWidth: 320,
          fallbackHeight: 330,
          offsetY: 6,
          placement: 'above',
        });
      },
      restoreFocus: true,
    });
  }

  private render(): HTMLElement {
    const pop = document.createElement('div');
    pop.className = 'tv-capital-popover reset-balance-popup';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.setAttribute('aria-labelledby', 'reset-capital-title');

    const presets = this.options.presetBaselines || [1000, 5000, 10000, 25000, 50000, 100000];
    const defaultBaseline = this.options.defaultBaseline ?? 10000;

    const chipsHtml = presets
      .map(
        (amt) => `
        <button type="button" class="capital-chip-btn ${amt === defaultBaseline ? 'active' : ''}" data-amount="${amt}">
          $${formatChipAmount(amt)}
        </button>
      `,
      )
      .join('');

    pop.innerHTML = `
      <div class="capital-popover-header">
        <div class="capital-popover-title" id="reset-capital-title">
          <span class="capital-title-icon">${getIcon('refresh')}</span>
          <span>Reset Paper Balance</span>
        </div>
        <button type="button" class="capital-popover-close" id="reset-capital-close-btn" aria-label="Close dialog" title="Close (Escape)">
          ${getIcon('close')}
        </button>
      </div>

      <div class="capital-field-wrap">
        <label class="capital-field-label">Target Starting Capital</label>
        <div class="capital-chip-grid" id="reset-chips">
          ${chipsHtml}
        </div>
      </div>

      <div class="capital-field-wrap">
        <label class="capital-field-label" for="capital-reset-input">Custom Capital Base</label>
        <div class="capital-input-currency-wrap">
          <span class="capital-currency-symbol">$</span>
          <input
            type="number"
            id="capital-reset-input"
            class="capital-number-input"
            min="1"
            step="any"
            value="${defaultBaseline}"
            placeholder="10000.00"
          />
        </div>
      </div>

      <label class="capital-checkbox-wrap" for="capital-clear-journal">
        <input type="checkbox" id="capital-clear-journal" />
        <div class="capital-checkbox-text">
          <span class="capital-checkbox-title">Clear trade journal & reset win rate stats</span>
          <span class="capital-checkbox-desc">Leave unchecked to keep past journal records intact</span>
        </div>
      </label>

      <div class="capital-warning-badge">
        <span class="capital-warning-icon">${getIcon('shield')}</span>
        <span>Warning: Active open positions will be closed at market.</span>
      </div>

      <div class="capital-actions-row">
        <button type="button" class="capital-btn capital-cancel-btn" id="reset-capital-cancel-btn">Cancel</button>
        <button type="button" class="capital-btn capital-reset-confirm-btn" id="capital-reset-confirm">
          Reset Account ($${formatChipAmount(defaultBaseline)})
        </button>
      </div>
    `;

    return pop;
  }

  private setupInteractivity(): void {
    this.baselineInput = this.el.querySelector<HTMLInputElement>('#capital-reset-input')!;
    this.clearJournalCheckbox = this.el.querySelector<HTMLInputElement>('#capital-clear-journal')!;
    this.confirmBtn = this.el.querySelector<HTMLButtonElement>('#capital-reset-confirm')!;
    this.chipBtns = Array.from(this.el.querySelectorAll<HTMLButtonElement>('.capital-chip-btn'));

    this.chipBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const amt = parseFloat(btn.dataset.amount || '0');
        this.baselineInput.value = String(amt);
        this.updateState();
        this.baselineInput.focus();
      });
    });

    this.baselineInput.addEventListener('input', () => {
      this.updateState();
    });

    this.baselineInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleConfirm();
      }
    });

    this.el.querySelector('#reset-capital-close-btn')?.addEventListener('click', () => {
      this.destroy();
      this.options.onCancel?.();
    });

    this.el.querySelector('#reset-capital-cancel-btn')?.addEventListener('click', () => {
      this.destroy();
      this.options.onCancel?.();
    });

    this.confirmBtn.addEventListener('click', () => {
      void this.handleConfirm();
    });

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.baselineInput.select();
      }
    }, 20);
  }

  private updateState(): void {
    const rawVal = parseFloat(this.baselineInput.value.trim());
    const isValid = !isNaN(rawVal) && rawVal > 0;

    this.chipBtns.forEach((btn) => {
      const chipAmt = parseFloat(btn.dataset.amount || '0');
      btn.classList.toggle('active', isValid && chipAmt === rawVal);
    });

    if (isValid) {
      this.confirmBtn.disabled = false;
      this.confirmBtn.textContent = `Reset Account ($${formatChipAmount(rawVal)})`;
    } else {
      this.confirmBtn.disabled = true;
      this.confirmBtn.textContent = 'Enter Positive Baseline';
    }
  }

  private async handleConfirm(): Promise<void> {
    const rawVal = parseFloat(this.baselineInput.value.trim());
    if (isNaN(rawVal) || rawVal <= 0) return;

    const clearJournal = this.clearJournalCheckbox.checked;
    this.confirmBtn.disabled = true;
    this.confirmBtn.textContent = 'Resetting...';

    try {
      await this.options.onConfirm(rawVal, clearJournal);
      this.destroy();
    } catch {
      this.confirmBtn.disabled = false;
      this.updateState();
    }
  }

  getElement(): HTMLElement {
    return this.el;
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.dismissalBinding.destroy();
    this.el.remove();
    this.onClosed?.();
  }
}

/**
 * Universal manager to coordinate Capital popovers and ensure exclusive display.
 */
export class CapitalPopoverManager {
  private activeAdd: AddBalancePopover | null = null;
  private activeReset: ResetBalancePopover | null = null;

  showAddBalance(options: AddBalanceOptions): AddBalancePopover {
    this.closeAll();
    this.activeAdd = new AddBalancePopover(options, () => {
      this.activeAdd = null;
    });
    return this.activeAdd;
  }

  showResetBalance(options: ResetBalanceOptions): ResetBalancePopover {
    this.closeAll();
    this.activeReset = new ResetBalancePopover(options, () => {
      this.activeReset = null;
    });
    return this.activeReset;
  }

  isAddOpen(): boolean {
    return this.activeAdd !== null;
  }

  isResetOpen(): boolean {
    return this.activeReset !== null;
  }

  closeAll(): void {
    if (this.activeAdd) {
      this.activeAdd.destroy();
      this.activeAdd = null;
    }
    if (this.activeReset) {
      this.activeReset.destroy();
      this.activeReset = null;
    }
  }

  destroy(): void {
    this.closeAll();
  }
}

