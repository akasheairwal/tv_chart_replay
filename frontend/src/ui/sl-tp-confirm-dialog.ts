/**
 * Confirmation & Direct Modification Dialog Modal for SL/TP position levels.
 */

import type { PositionDefinition } from '../trading/trading-types';
import { getIcon } from './icons';

export interface SlTpModificationRequest {
  position: PositionDefinition;
  type: 'SL' | 'TP' | 'BOTH';
  originalPrice: number;
  newPrice: number;
  newSlPrice?: number | null;
  newTpPrice?: number | null;
}

export class SlTpConfirmDialog {
  private readonly backdrop: HTMLElement;
  private onConfirmCallback?: (req: SlTpModificationRequest) => void;
  private currentReq: SlTpModificationRequest | null = null;
  private isEditMode = false;

  constructor(parent: HTMLElement = document.body) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'sltp-modal-backdrop';
    this.backdrop.style.display = 'none';

    this.backdrop.innerHTML = `
      <div class="sltp-modal-dialog">
        <div class="sltp-modal-header">
          <div class="sltp-modal-title">
            <span class="sltp-modal-icon">${getIcon('lightning')}</span>
            <span id="sltp-modal-title-text">Confirm SL / TP Modification</span>
          </div>
          <button type="button" class="sltp-modal-close" id="sltp-close-btn">&times;</button>
        </div>

        <div class="sltp-modal-body">
          <div class="sltp-pos-info-row" id="sltp-pos-info">
            <span class="sltp-sym-badge" id="sltp-sym">EURUSD</span>
            <span class="sltp-side-badge" id="sltp-side">BUY</span>
            <span class="sltp-lots-badge" id="sltp-lots">1.00 Lot</span>
            <span class="sltp-entry-badge" id="sltp-entry">@ 1.08500</span>
          </div>

          <!-- Mode 1: Drag Confirmation View -->
          <div class="sltp-param-card" id="sltp-param-card">
            <div class="sltp-param-header">
              <span class="sltp-param-label" id="sltp-param-label">Stop Loss Target</span>
            </div>

            <div class="sltp-price-compare-row">
              <div class="sltp-price-box">
                <span class="sltp-box-label">Current Target</span>
                <span class="sltp-box-price" id="sltp-old-price">1.08500</span>
              </div>
              <div class="sltp-compare-arrow">&rarr;</div>
              <div class="sltp-price-box highlight">
                <span class="sltp-box-label">New Target</span>
                <span class="sltp-box-price" id="sltp-new-price">1.08300</span>
              </div>
            </div>

            <div class="sltp-metrics-diff-grid">
              <div class="sltp-diff-item">
                <span class="sltp-diff-label">Pips Distance:</span>
                <span class="sltp-diff-val" id="sltp-pips-diff">50.0 p &rarr; 70.0 p</span>
              </div>
              <div class="sltp-diff-item">
                <span class="sltp-diff-label" id="sltp-impact-label">Projected Risk ($):</span>
                <span class="sltp-diff-val" id="sltp-impact-diff">-$100.00 &rarr; -$140.00</span>
              </div>
            </div>
          </div>

          <!-- Mode 2: Direct Edit Form View -->
          <div class="sltp-edit-form" id="sltp-edit-form" style="display: none;">
            <div class="sltp-edit-field-group">
              <label class="sltp-field-label sl-label">Stop Loss (SL) Target Price</label>
              <div class="sltp-field-input-row">
                <input type="number" step="0.00001" class="sltp-edit-input" id="sltp-sl-input" placeholder="e.g. 1.08200 (0 to remove)" />
                <span class="sltp-input-hint" id="sltp-sl-hint">Pips: - | Risk: -</span>
              </div>
            </div>

            <div class="sltp-edit-field-group">
              <label class="sltp-field-label tp-label">Take Profit (TP) Target Price</label>
              <div class="sltp-field-input-row">
                <input type="number" step="0.00001" class="sltp-edit-input" id="sltp-tp-input" placeholder="e.g. 1.09500 (0 to remove)" />
                <span class="sltp-input-hint" id="sltp-tp-hint">Pips: - | Reward: -</span>
              </div>
            </div>
          </div>
        </div>

        <div class="sltp-modal-footer">
          <button type="button" class="sltp-btn secondary-btn" id="sltp-cancel-btn">Cancel</button>
          <button type="button" class="sltp-btn primary-btn" id="sltp-confirm-btn">Confirm Modification</button>
        </div>
      </div>
    `;

    parent.appendChild(this.backdrop);
    this.wireEvents();
  }

  show(req: SlTpModificationRequest, onConfirm: (req: SlTpModificationRequest) => void): void {
    this.isEditMode = false;
    this.currentReq = req;
    this.onConfirmCallback = onConfirm;

    const titleEl = this.backdrop.querySelector('#sltp-modal-title-text');
    const paramCard = this.backdrop.querySelector<HTMLElement>('#sltp-param-card');
    const editForm = this.backdrop.querySelector<HTMLElement>('#sltp-edit-form');

    if (titleEl) titleEl.textContent = 'Confirm SL / TP Modification';
    if (paramCard) paramCard.style.display = 'flex';
    if (editForm) editForm.style.display = 'none';

    const { position, type, originalPrice, newPrice } = req;
    const isLong = position.side === 'LONG' || (position.side as any) === 'BUY';
    const isCrypto = position.entry_price > 1000;
    const isJpy = position.symbol.includes('JPY');
    const pipSize = isCrypto ? 1.0 : isJpy ? 0.01 : 0.0001;
    const multiplier = position.entry_price < 50 && position.quantity <= 100 ? 100000.0 : 1.0;

    const formatPrice = (val: number) => {
      if (!val || val <= 0) return 'None';
      return isCrypto ? val.toFixed(2) : isJpy ? val.toFixed(3) : val.toFixed(5);
    };

    const symEl = this.backdrop.querySelector('#sltp-sym');
    const sideEl = this.backdrop.querySelector('#sltp-side');
    const lotsEl = this.backdrop.querySelector('#sltp-lots');
    const entryEl = this.backdrop.querySelector('#sltp-entry');

    if (symEl) symEl.textContent = position.symbol;
    if (sideEl) {
      sideEl.textContent = isLong ? 'BUY' : 'SELL';
      sideEl.className = `sltp-side-badge ${isLong ? 'long' : 'short'}`;
    }
    if (lotsEl) lotsEl.textContent = `${position.quantity.toFixed(2)} Lots`;
    if (entryEl) entryEl.textContent = `@ ${formatPrice(position.entry_price)}`;

    const paramLabel = this.backdrop.querySelector('#sltp-param-label');
    const oldPriceEl = this.backdrop.querySelector('#sltp-old-price');
    const newPriceEl = this.backdrop.querySelector('#sltp-new-price');
    const pipsDiffEl = this.backdrop.querySelector('#sltp-pips-diff');
    const impactLabel = this.backdrop.querySelector('#sltp-impact-label');
    const impactDiffEl = this.backdrop.querySelector('#sltp-impact-diff');
    const confirmBtn = this.backdrop.querySelector<HTMLElement>('#sltp-confirm-btn');

    if (paramCard) paramCard.className = `sltp-param-card ${type.toLowerCase()}-card`;
    if (paramLabel) paramLabel.textContent = type === 'SL' ? 'Stop Loss (SL) Modification' : 'Take Profit (TP) Modification';

    if (oldPriceEl) oldPriceEl.textContent = formatPrice(originalPrice);
    if (newPriceEl) newPriceEl.textContent = formatPrice(newPrice);

    const oldDelta = originalPrice > 0 ? Math.abs(originalPrice - position.entry_price) : 0;
    const oldPips = oldDelta / pipSize;
    const oldDollar = oldDelta * position.quantity * multiplier;

    const newDelta = Math.abs(newPrice - position.entry_price);
    const newPips = newDelta / pipSize;
    const newDollar = newDelta * position.quantity * multiplier;

    if (pipsDiffEl) {
      pipsDiffEl.textContent = `${oldPips.toFixed(1)}p → ${newPips.toFixed(1)}p`;
    }

    if (impactLabel) {
      impactLabel.textContent = type === 'SL' ? 'Max Risk Amount ($):' : 'Projected Profit ($):';
    }

    if (impactDiffEl) {
      const sign = type === 'SL' ? '-' : '+';
      impactDiffEl.textContent = `${sign}$${oldDollar.toFixed(2)} → ${sign}$${newDollar.toFixed(2)}`;
      impactDiffEl.className = `sltp-diff-val ${type === 'SL' ? 'risk-red' : 'reward-green'}`;
    }

    if (confirmBtn) {
      confirmBtn.className = `sltp-btn primary-btn ${type.toLowerCase()}-btn`;
      confirmBtn.textContent = 'Confirm Modification';
    }

    this.backdrop.style.display = 'flex';
  }

  showEditModal(position: PositionDefinition, onConfirm: (req: SlTpModificationRequest) => void): void {
    this.isEditMode = true;
    this.onConfirmCallback = onConfirm;
    this.currentReq = {
      position,
      type: 'BOTH',
      originalPrice: position.entry_price,
      newPrice: position.entry_price,
    };

    const titleEl = this.backdrop.querySelector('#sltp-modal-title-text');
    const paramCard = this.backdrop.querySelector<HTMLElement>('#sltp-param-card');
    const editForm = this.backdrop.querySelector<HTMLElement>('#sltp-edit-form');
    const confirmBtn = this.backdrop.querySelector<HTMLElement>('#sltp-confirm-btn');

    if (titleEl) titleEl.textContent = 'Modify Position SL & TP Targets';
    if (paramCard) paramCard.style.display = 'none';
    if (editForm) editForm.style.display = 'flex';

    const isLong = position.side === 'LONG' || (position.side as any) === 'BUY';
    const isCrypto = position.entry_price > 1000;
    const isJpy = position.symbol.includes('JPY');

    const formatPrice = (val?: number | null) => {
      if (!val || val <= 0) return '';
      return isCrypto ? val.toFixed(2) : isJpy ? val.toFixed(3) : val.toFixed(5);
    };

    const symEl = this.backdrop.querySelector('#sltp-sym');
    const sideEl = this.backdrop.querySelector('#sltp-side');
    const lotsEl = this.backdrop.querySelector('#sltp-lots');
    const entryEl = this.backdrop.querySelector('#sltp-entry');

    if (symEl) symEl.textContent = position.symbol;
    if (sideEl) {
      sideEl.textContent = isLong ? 'BUY' : 'SELL';
      sideEl.className = `sltp-side-badge ${isLong ? 'long' : 'short'}`;
    }
    if (lotsEl) lotsEl.textContent = `${position.quantity.toFixed(2)} Lots`;
    if (entryEl) entryEl.textContent = `@ ${position.entry_price.toFixed(4)}`;

    const slInput = this.backdrop.querySelector<HTMLInputElement>('#sltp-sl-input');
    const tpInput = this.backdrop.querySelector<HTMLInputElement>('#sltp-tp-input');

    if (slInput) slInput.value = formatPrice(position.stop_loss);
    if (tpInput) tpInput.value = formatPrice(position.take_profit);

    if (confirmBtn) {
      confirmBtn.className = 'sltp-btn primary-btn';
      confirmBtn.textContent = 'Save Modification';
    }

    this.updateEditHints(position);
    this.backdrop.style.display = 'flex';
  }

  hide(): void {
    this.backdrop.style.display = 'none';
    this.currentReq = null;
  }

  private updateEditHints(position: PositionDefinition): void {
    const isCrypto = position.entry_price > 1000;
    const isJpy = position.symbol.includes('JPY');
    const pipSize = isCrypto ? 1.0 : isJpy ? 0.01 : 0.0001;
    const multiplier = position.entry_price < 50 && position.quantity <= 100 ? 100000.0 : 1.0;

    const slInput = this.backdrop.querySelector<HTMLInputElement>('#sltp-sl-input');
    const tpInput = this.backdrop.querySelector<HTMLInputElement>('#sltp-tp-input');
    const slHint = this.backdrop.querySelector('#sltp-sl-hint');
    const tpHint = this.backdrop.querySelector('#sltp-tp-hint');

    const slPrice = parseFloat(slInput?.value || '0');
    if (slHint) {
      if (slPrice > 0) {
        const slDelta = Math.abs(slPrice - position.entry_price);
        const slPips = slDelta / pipSize;
        const slRisk = slDelta * position.quantity * multiplier;
        slHint.textContent = `Pips: ${slPips.toFixed(1)}p | Risk: -$${slRisk.toFixed(2)}`;
      } else {
        slHint.textContent = 'No Stop Loss set';
      }
    }

    const tpPrice = parseFloat(tpInput?.value || '0');
    if (tpHint) {
      if (tpPrice > 0) {
        const tpDelta = Math.abs(tpPrice - position.entry_price);
        const tpPips = tpDelta / pipSize;
        const tpReward = tpDelta * position.quantity * multiplier;
        tpHint.textContent = `Pips: +${tpPips.toFixed(1)}p | Reward: +$${tpReward.toFixed(2)}`;
      } else {
        tpHint.textContent = 'No Take Profit set';
      }
    }
  }

  private wireEvents(): void {
    this.backdrop.querySelector('#sltp-close-btn')?.addEventListener('click', () => this.hide());
    this.backdrop.querySelector('#sltp-cancel-btn')?.addEventListener('click', () => this.hide());

    const slInput = this.backdrop.querySelector<HTMLInputElement>('#sltp-sl-input');
    const tpInput = this.backdrop.querySelector<HTMLInputElement>('#sltp-tp-input');

    slInput?.addEventListener('input', () => {
      if (this.currentReq) this.updateEditHints(this.currentReq.position);
    });
    tpInput?.addEventListener('input', () => {
      if (this.currentReq) this.updateEditHints(this.currentReq.position);
    });

    this.backdrop.querySelector('#sltp-confirm-btn')?.addEventListener('click', () => {
      if (!this.currentReq || !this.onConfirmCallback) return;

      if (this.isEditMode) {
        const slVal = parseFloat(slInput?.value || '0');
        const tpVal = parseFloat(tpInput?.value || '0');

        const req: SlTpModificationRequest = {
          position: this.currentReq.position,
          type: 'BOTH',
          originalPrice: this.currentReq.position.entry_price,
          newPrice: this.currentReq.position.entry_price,
          newSlPrice: slVal > 0 ? slVal : null,
          newTpPrice: tpVal > 0 ? tpVal : null,
        };
        this.hide();
        this.onConfirmCallback(req);
      } else {
        const req = this.currentReq;
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
