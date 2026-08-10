/**
 * QuickTradeOverlay — Exness / TradingView style 1-click Quick Buy / Sell bar
 * anchored to the top-left corner of the chart.
 */

import type { PythonBridge } from '../bridge/python-bridge';
import type { OrderDefinition } from '../trading/trading-types';
import { getIcon } from './icons';

export class QuickTradeOverlay {
  private readonly el: HTMLElement;
  private currentSymbol = 'EURUSD';
  private currentPrice = 1.0850;
  private spreadPips = 0.8;
  private quantity = 1.0;

  private sellPriceEl: HTMLElement | null = null;
  private buyPriceEl: HTMLElement | null = null;
  private spreadEl: HTMLElement | null = null;
  private qtyInput: HTMLInputElement | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly bridge: PythonBridge | null,
    private readonly onOrderPlaced?: (order: OrderDefinition) => void,
  ) {
    this.el = this.buildElement();
    this.parent.appendChild(this.el);
    this.updatePrices();
  }

  setSymbol(symbol: string): void {
    this.currentSymbol = (symbol || 'EURUSD').toUpperCase();
    this.updatePrices();
  }

  setPrice(price: number): void {
    if (price > 0) {
      this.currentPrice = price;
      this.updatePrices();
    }
  }

  setQuantity(qty: number): void {
    this.quantity = Math.max(0.01, qty);
    if (this.qtyInput) {
      this.qtyInput.value = this.quantity.toFixed(2);
    }
  }

  getQuantity(): number {
    return this.quantity;
  }

  private updatePrices(): void {
    const isJpy = this.currentSymbol.includes('JPY');
    const isCrypto = this.currentPrice > 1000;
    const pipSize = isCrypto ? 1.0 : isJpy ? 0.01 : 0.0001;
    const halfSpread = (this.spreadPips * pipSize) / 2;

    const bid = Math.max(0, this.currentPrice - halfSpread);
    const ask = this.currentPrice + halfSpread;

    const formatPrice = (val: number) => {
      if (val === 0) return '--';
      return isCrypto ? val.toFixed(2) : isJpy ? val.toFixed(3) : val.toFixed(5);
    };

    if (this.sellPriceEl) this.sellPriceEl.textContent = formatPrice(bid);
    if (this.buyPriceEl) this.buyPriceEl.textContent = formatPrice(ask);
    if (this.spreadEl) this.spreadEl.textContent = this.spreadPips.toFixed(1);
  }

  private buildElement(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'chart-quick-trade-bar';
    root.innerHTML = `
      <!-- Quick SELL button -->
      <button type="button" class="quick-trade-btn quick-sell-btn" id="quick-sell-action" title="Quick SELL Market Order (1-Click)">
        <div class="quick-btn-main">
          <span class="quick-btn-action">SELL</span>
          <span class="quick-btn-price" id="quick-sell-price">--</span>
        </div>
      </button>

      <!-- Center Lot Size Stepper & Spread -->
      <div class="quick-trade-center">
        <div class="quick-qty-stepper">
          <button type="button" class="quick-step-btn" id="quick-minus-btn" title="Decrease volume">${getIcon('minus')}</button>
          <input type="number" class="quick-qty-input" id="quick-qty-input" value="1.00" min="0.01" step="0.01" title="Lot size (Volume)" />
          <button type="button" class="quick-step-btn" id="quick-plus-btn" title="Increase volume">${getIcon('plus')}</button>
        </div>
        <div class="quick-spread-tag" title="Live Spread (pips)">
          <span class="quick-spread-label">SPR</span>
          <span class="quick-spread-val" id="quick-spread-val">${this.spreadPips.toFixed(1)}</span>
        </div>
      </div>

      <!-- Quick BUY button -->
      <button type="button" class="quick-trade-btn quick-buy-btn" id="quick-buy-action" title="Quick BUY Market Order (1-Click)">
        <div class="quick-btn-main">
          <span class="quick-btn-action">BUY</span>
          <span class="quick-btn-price" id="quick-buy-price">--</span>
        </div>
      </button>
    `;

    this.sellPriceEl = root.querySelector('#quick-sell-price');
    this.buyPriceEl = root.querySelector('#quick-buy-price');
    this.spreadEl = root.querySelector('#quick-spread-val');
    this.qtyInput = root.querySelector('#quick-qty-input');

    // Stepper buttons
    root.querySelector('#quick-minus-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      let cur = parseFloat(this.qtyInput?.value || '1.0') || 1.0;
      cur = Math.max(0.01, cur <= 0.1 ? cur - 0.01 : cur <= 1 ? cur - 0.1 : cur - 0.5);
      this.quantity = cur;
      if (this.qtyInput) this.qtyInput.value = cur.toFixed(2);
    });

    root.querySelector('#quick-plus-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      let cur = parseFloat(this.qtyInput?.value || '1.0') || 1.0;
      cur = cur < 0.1 ? cur + 0.01 : cur < 1 ? cur + 0.1 : cur + 0.5;
      this.quantity = cur;
      if (this.qtyInput) this.qtyInput.value = cur.toFixed(2);
    });

    this.qtyInput?.addEventListener('input', () => {
      const val = Math.max(0.01, parseFloat(this.qtyInput?.value || '1.0') || 0.01);
      this.quantity = val;
    });

    this.qtyInput?.addEventListener('change', () => {
      const val = Math.max(0.01, parseFloat(this.qtyInput?.value || '1.0') || 0.01);
      this.quantity = val;
      if (this.qtyInput) this.qtyInput.value = val.toFixed(2);
    });

    // Execution buttons
    root.querySelector('#quick-sell-action')?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.executeOrder('SELL');
    });

    root.querySelector('#quick-buy-action')?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.executeOrder('BUY');
    });

    return root;
  }

  private async executeOrder(side: 'BUY' | 'SELL'): Promise<void> {
    const qty = this.quantity;
    const basePrice = this.currentPrice;

    const payload: OrderDefinition = {
      symbol: this.currentSymbol,
      side,
      order_type: 'MARKET',
      quantity: qty,
      current_market_price: basePrice,
    };

    if (this.bridge) {
      try {
        const res = await this.bridge.callJson<{ ok: boolean; data?: OrderDefinition }>(
          'placeOrder',
          payload,
        );
        if (res.ok && res.data) {
          if (this.onOrderPlaced) this.onOrderPlaced(res.data);
          return;
        }
      } catch {
        /* fallback to browser mode */
      }
    }

    if (this.onOrderPlaced) {
      this.onOrderPlaced(payload);
    }
  }

  destroy(): void {
    this.el.remove();
  }
}
