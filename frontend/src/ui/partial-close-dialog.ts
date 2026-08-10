/**
 * Partial Close Modal Dialog — allows custom lot sizing or preset percentage closing.
 */

import type { PositionDefinition } from '../trading/trading-types';
import { getIcon } from './icons';

export interface PartialCloseRequest {
  position: PositionDefinition;
  closeQuantity: number;
  currentPrice: number;
}

export class PartialCloseDialog {
  private readonly backdrop: HTMLElement;
  private currentPos: PositionDefinition | null = null;
  private currentPrice = 0;
  private onConfirmCallback?: (req: PartialCloseRequest) => void;

  constructor(parent: HTMLElement = document.body) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'partial-modal-backdrop';
    this.backdrop.style.display = 'none';

    this.backdrop.innerHTML = `
      <div class="partial-modal-dialog">
        <div class="partial-modal-header">
          <div class="partial-modal-title">
            <span class="partial-modal-icon">${getIcon('scissors')}</span>
            <span>Partial Position Close</span>
          </div>
          <button type="button" class="partial-modal-close" id="partial-close-x">&times;</button>
        </div>

        <div class="partial-modal-body">
          <div class="partial-pos-summary">
            <span class="partial-sym-badge" id="partial-sym">EURUSD</span>
            <span class="partial-side-badge" id="partial-side">BUY</span>
            <span class="partial-total-lots" id="partial-total-lots">Total: 1.00 Lot</span>
          </div>

          <div class="partial-input-group">
            <label class="partial-input-label">Volume to Close (Lots)</label>
            <div class="partial-input-row">
              <input type="number" step="0.01" min="0.01" class="partial-lot-input" id="partial-lot-input" value="0.50" />
              <span class="partial-input-unit">Lots</span>
            </div>

            <div class="partial-preset-chips">
              <button type="button" class="partial-chip" data-pct="0.25">25%</button>
              <button type="button" class="partial-chip active" data-pct="0.50">50%</button>
              <button type="button" class="partial-chip" data-pct="0.75">75%</button>
              <button type="button" class="partial-chip" data-pct="1.00">100% (Full)</button>
            </div>
          </div>

          <div class="partial-breakdown-card">
            <div class="partial-breakdown-row">
              <span>Closing Volume:</span>
              <strong id="partial-closing-lots">0.50 Lots</strong>
            </div>
            <div class="partial-breakdown-row">
              <span>Remaining Volume:</span>
              <strong id="partial-remaining-lots">0.50 Lots</strong>
            </div>
            <div class="partial-breakdown-row">
              <span>Est. Realized PnL:</span>
              <strong id="partial-est-pnl" class="pnl-green">+$50.00</strong>
            </div>
          </div>
        </div>

        <div class="partial-modal-footer">
          <button type="button" class="sltp-btn secondary-btn" id="partial-cancel-btn">Cancel</button>
          <button type="button" class="sltp-btn primary-btn partial-confirm-btn" id="partial-confirm-btn">Confirm Partial Close</button>
        </div>
      </div>
    `;

    parent.appendChild(this.backdrop);
    this.wireEvents();
  }

  show(position: PositionDefinition, currentPrice: number, onConfirm: (req: PartialCloseRequest) => void): void {
    this.currentPos = position;
    this.currentPrice = currentPrice > 0 ? currentPrice : position.current_price || position.entry_price;
    this.onConfirmCallback = onConfirm;

    const isLong = position.side === 'LONG' || (position.side as any) === 'BUY';
    const symEl = this.backdrop.querySelector('#partial-sym');
    const sideEl = this.backdrop.querySelector('#partial-side');
    const totalLotsEl = this.backdrop.querySelector('#partial-total-lots');
    const lotInput = this.backdrop.querySelector<HTMLInputElement>('#partial-lot-input');

    if (symEl) symEl.textContent = position.symbol;
    if (sideEl) {
      sideEl.textContent = isLong ? 'BUY' : 'SELL';
      sideEl.className = `partial-side-badge ${isLong ? 'long' : 'short'}`;
    }
    if (totalLotsEl) totalLotsEl.textContent = `Total: ${position.quantity.toFixed(2)} Lots`;

    const defaultQty = Math.max(0.01, round2(position.quantity * 0.5));
    if (lotInput) {
      lotInput.max = position.quantity.toString();
      lotInput.value = defaultQty.toFixed(2);
    }

    this.recalculateBreakdown();
    this.backdrop.style.display = 'flex';
  }

  hide(): void {
    this.backdrop.style.display = 'none';
    this.currentPos = null;
  }

  private recalculateBreakdown(): void {
    if (!this.currentPos) return;

    const lotInput = this.backdrop.querySelector<HTMLInputElement>('#partial-lot-input');
    const closingLotsEl = this.backdrop.querySelector('#partial-closing-lots');
    const remainingLotsEl = this.backdrop.querySelector('#partial-remaining-lots');
    const estPnlEl = this.backdrop.querySelector('#partial-est-pnl');
    const confirmBtn = this.backdrop.querySelector('#partial-confirm-btn');

    let closeQty = parseFloat(lotInput?.value || '0');
    if (isNaN(closeQty) || closeQty <= 0) closeQty = 0.01;
    if (closeQty > this.currentPos.quantity) closeQty = this.currentPos.quantity;

    const remainQty = Math.max(0, round2(this.currentPos.quantity - closeQty));

    const isLong = this.currentPos.side === 'LONG' || (this.currentPos.side as any) === 'BUY';
    const multiplier = this.currentPos.entry_price < 50 && this.currentPos.quantity <= 100 ? 100000.0 : 1.0;
    const diff = (this.currentPrice - this.currentPos.entry_price) * (isLong ? 1 : -1);
    const estPnl = diff * closeQty * multiplier;

    if (closingLotsEl) closingLotsEl.textContent = `${closeQty.toFixed(2)} Lots`;
    if (remainingLotsEl) remainingLotsEl.textContent = `${remainQty.toFixed(2)} Lots`;

    if (estPnlEl) {
      const sign = estPnl >= 0 ? '+' : '';
      estPnlEl.textContent = `${sign}$${estPnl.toFixed(2)}`;
      estPnlEl.className = estPnl >= 0 ? 'pnl-green' : 'pnl-red';
    }

    if (confirmBtn) {
      confirmBtn.textContent = closeQty >= this.currentPos.quantity
        ? 'Close Full Position'
        : `Close ${closeQty.toFixed(2)} Lots`;
    }
  }

  private wireEvents(): void {
    this.backdrop.querySelector('#partial-close-x')?.addEventListener('click', () => this.hide());
    this.backdrop.querySelector('#partial-cancel-btn')?.addEventListener('click', () => this.hide());

    const lotInput = this.backdrop.querySelector<HTMLInputElement>('#partial-lot-input');
    lotInput?.addEventListener('input', () => this.recalculateBreakdown());

    this.backdrop.querySelectorAll('.partial-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (!this.currentPos) return;
        this.backdrop.querySelectorAll('.partial-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');

        const pct = parseFloat((chip as HTMLElement).dataset.pct || '0.5');
        const qty = Math.max(0.01, round2(this.currentPos.quantity * pct));
        if (lotInput) {
          lotInput.value = qty.toFixed(2);
        }
        this.recalculateBreakdown();
      });
    });

    this.backdrop.querySelector('#partial-confirm-btn')?.addEventListener('click', () => {
      if (this.currentPos && this.onConfirmCallback) {
        let closeQty = parseFloat(lotInput?.value || '0');
        if (isNaN(closeQty) || closeQty <= 0) closeQty = 0.01;
        const req: PartialCloseRequest = {
          position: this.currentPos,
          closeQuantity: Math.min(closeQty, this.currentPos.quantity),
          currentPrice: this.currentPrice,
        };
        this.hide();
        this.onConfirmCallback(req);
      }
    });

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.hide();
      }
    });
  }
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}
