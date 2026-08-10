/**
 * Order Entry Panel UI — Exness WebTerminal style collapsible left side trade panel.
 */

import type { PythonBridge } from '../bridge/python-bridge';
import type { OrderDefinition, PositionDefinition } from '../trading/trading-types';
import { getIcon } from './icons';

export class OrderPanel {
  private readonly container: HTMLElement;
  private currentSymbol = 'EURUSD';
  private currentPrice = 0.0;
  private spreadPips = 0.8;
  private activeType: 'MARKET' | 'LIMIT' | 'STOP' = 'MARKET';
  private positions: PositionDefinition[] = [];
  private onCollapseChange?: (collapsed: boolean) => void;

  constructor(
    private readonly parent: HTMLElement,
    private readonly bridge: PythonBridge | null,
    private readonly onOrderPlaced?: (order: OrderDefinition) => void,
    onCollapseChange?: (collapsed: boolean) => void,
  ) {
    this.onCollapseChange = onCollapseChange;
    this.container = this.buildWidget();
    this.parent.appendChild(this.container);
  }

  setSymbol(symbol: string): void {
    this.currentSymbol = (symbol || 'EURUSD').toUpperCase();
    const symEl = this.container.querySelector('#order-sym-badge');
    if (symEl) symEl.textContent = this.currentSymbol;
    this.updatePriceCards();
    this.updateSummary();
  }

  setCurrentPrice(price: number): void {
    if (price > 0) {
      this.currentPrice = price;
      const priceEl = this.container.querySelector<HTMLInputElement>('#order-price-input');
      if (priceEl && (!priceEl.value || priceEl.value === '0')) {
        priceEl.value = price.toFixed(4);
      }
      this.updatePriceCards();
      this.updateSummary();
    }
  }

  setPositions(positions: PositionDefinition[]): void {
    this.positions = positions || [];
    this.updateSummary();
  }

  toggle(): void {
    const isCollapsed = this.parent.classList.contains('collapsed');
    if (isCollapsed) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  collapse(): void {
    this.parent.classList.add('collapsed');
    const expandHandle = document.getElementById('trade-panel-expand-handle');
    if (expandHandle) expandHandle.classList.add('visible');
    if (this.onCollapseChange) this.onCollapseChange(true);
  }

  expand(): void {
    this.parent.classList.remove('collapsed');
    const expandHandle = document.getElementById('trade-panel-expand-handle');
    if (expandHandle) expandHandle.classList.remove('visible');
    if (this.onCollapseChange) this.onCollapseChange(false);
  }

  isCollapsed(): boolean {
    return this.parent.classList.contains('collapsed');
  }

  private updatePriceCards(): void {
    const isJpy = this.currentSymbol.includes('JPY');
    const isCrypto = this.currentPrice > 1000;
    const pipSize = isCrypto ? 1.0 : isJpy ? 0.01 : 0.0001;
    const halfSpread = (this.spreadPips * pipSize) / 2;

    const bidPrice = Math.max(0, this.currentPrice - halfSpread);
    const askPrice = this.currentPrice + halfSpread;

    const sellPriceEl = this.container.querySelector('#exness-sell-price');
    const buyPriceEl = this.container.querySelector('#exness-buy-price');
    const spreadEl = this.container.querySelector('#exness-spread-badge');

    const formatRate = (val: number) => {
      if (val === 0) return '--';
      return isCrypto ? val.toFixed(2) : isJpy ? val.toFixed(3) : val.toFixed(5);
    };

    if (sellPriceEl) sellPriceEl.textContent = formatRate(bidPrice);
    if (buyPriceEl) buyPriceEl.textContent = formatRate(askPrice);
    if (spreadEl) spreadEl.textContent = `${this.spreadPips.toFixed(1)}`;
  }

  private updateSummary(): void {
    const cleanSym = (s: string) => (s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const curClean = cleanSym(this.currentSymbol);
    const symPositions = this.positions.filter((p) => {
      const posClean = cleanSym(p.symbol);
      return posClean === curClean || posClean.startsWith(curClean) || curClean.startsWith(posClean);
    });

    const countEl = this.container.querySelector('#trade-panel-pos-count');
    const pnlEl = this.container.querySelector('#trade-panel-pos-pnl');

    if (countEl) {
      countEl.textContent = `${symPositions.length} Open`;
    }

    if (pnlEl) {
      const totalPnl = symPositions.reduce((acc, p) => acc + (p.unrealized_pnl || 0), 0);
      const sign = totalPnl >= 0 ? '+' : '';
      pnlEl.textContent = `${sign}$${totalPnl.toFixed(2)}`;
      pnlEl.className = `trade-summary-pnl ${totalPnl >= 0 ? 'pnl-green' : 'pnl-red'}`;
    }
  }

  private buildWidget(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'trade-panel-inner';
    el.innerHTML = `
      <div class="trade-panel-header">
        <div class="trade-panel-title-wrap">
          <span class="trade-panel-icon">${getIcon('lightning')}</span>
          <span class="trade-panel-title">TRADE</span>
          <span class="order-sym-badge" id="order-sym-badge">${this.currentSymbol}</span>
        </div>
        <button type="button" class="panel-collapse-btn" id="trade-panel-collapse-btn" title="Collapse Trade Panel">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="13 17 18 12 13 7"></polyline>
            <polyline points="6 17 11 12 6 7"></polyline>
          </svg>
        </button>
      </div>

      <div class="trade-panel-body">
        <!-- Order Type Tabs -->
        <div class="order-type-row">
          <button type="button" class="order-type-btn active" data-type="MARKET">Market</button>
          <button type="button" class="order-type-btn" data-type="LIMIT">Limit</button>
          <button type="button" class="order-type-btn" data-type="STOP">Stop</button>
        </div>

        <!-- Exness Bid/Ask Split Execution Cards -->
        <div class="exness-bid-ask-row">
          <button type="button" class="exness-quote-card sell-card" id="order-sell-btn">
            <div class="quote-header">
              <span class="quote-action">SELL</span>
              <span class="quote-arrow">${getIcon('sell_arrow')}</span>
            </div>
            <div class="quote-price" id="exness-sell-price">--</div>
          </button>

          <div class="exness-spread-wrap">
            <span class="spread-label">SPREAD</span>
            <span class="spread-pill" id="exness-spread-badge">${this.spreadPips.toFixed(1)}</span>
          </div>

          <button type="button" class="exness-quote-card buy-card" id="order-buy-btn">
            <div class="quote-header">
              <span class="quote-action">BUY</span>
              <span class="quote-arrow">${getIcon('buy_arrow')}</span>
            </div>
            <div class="quote-price" id="exness-buy-price">--</div>
          </button>
        </div>

        <!-- Lot size selector with chips and stepper -->
        <div class="order-field-group">
          <div class="order-field-header-row">
            <label class="order-field-label">Volume (Lots)</label>
            <span class="order-lot-info" id="order-lot-info">1.00 Lot ≈ $10.00 / pip</span>
          </div>
          <div class="order-lot-stepper-row">
            <button type="button" class="order-step-btn" id="lot-minus-btn">${getIcon('minus')}</button>
            <input class="order-field-input" id="order-qty-input" type="number" step="0.01" value="1.0" min="0.01" />
            <button type="button" class="order-step-btn" id="lot-plus-btn">${getIcon('plus')}</button>
          </div>
          <div class="order-lot-chips">
            <button type="button" class="lot-chip" data-lot="0.01">0.01</button>
            <button type="button" class="lot-chip" data-lot="0.05">0.05</button>
            <button type="button" class="lot-chip" data-lot="0.10">0.10</button>
            <button type="button" class="lot-chip" data-lot="0.50">0.50</button>
            <button type="button" class="lot-chip active" data-lot="1.00">1.00</button>
            <button type="button" class="lot-chip" data-lot="2.00">2.00</button>
            <button type="button" class="lot-chip" data-lot="5.00">5.00</button>
          </div>
        </div>

        <!-- Limit / Stop Price Input (visible when LIMIT/STOP selected) -->
        <div class="order-field-group price-field" id="order-price-group" style="display: none;">
          <label class="order-field-label">Order Price</label>
          <input class="order-field-input" id="order-price-input" type="number" step="0.0001" placeholder="Target Price" />
        </div>

        <!-- SL & TP Fields (Flexibly aligned grid) -->
        <div class="order-field-row sl-tp-row">
          <div class="order-field-group sl-group">
            <label class="order-field-label" title="Stop Loss (Price or Pips)">Stop Loss (SL)</label>
            <input class="order-field-input" id="order-sl-input" type="number" step="any" placeholder="Price / Pips" />
          </div>
          <div class="order-field-group tp-group">
            <label class="order-field-label" title="Take Profit (Price or Pips)">Take Profit (TP)</label>
            <input class="order-field-input" id="order-tp-input" type="number" step="any" placeholder="Price / Pips" />
          </div>
        </div>

        <!-- Active Position Summary Widget -->
        <div class="trade-summary-card">
          <div class="trade-summary-header">
            <span class="trade-summary-title">ACTIVE POSITIONS</span>
            <span class="trade-summary-count" id="trade-panel-pos-count">0 Open</span>
          </div>
          <div class="trade-summary-row">
            <span class="trade-summary-label">Symbol PnL:</span>
            <span class="trade-summary-pnl" id="trade-panel-pos-pnl">$0.00</span>
          </div>
        </div>
      </div>
    `;

    // Wire expand handle from chart area
    const expandHandle = document.getElementById('trade-panel-expand-handle');
    if (expandHandle) {
      expandHandle.addEventListener('click', () => {
        this.expand();
      });
    }

    const qtyInput = el.querySelector<HTMLInputElement>('#order-qty-input')!;
    const lotInfo = el.querySelector<HTMLElement>('#order-lot-info')!;

    const updateLotInfo = (val: number) => {
      const isJpy = this.currentSymbol.includes('JPY');
      const isCrypto = this.currentPrice > 1000;
      const pipVal = val * (isCrypto ? 1 : isJpy ? 1000 : 10);
      if (lotInfo) {
        lotInfo.textContent = `${val.toFixed(2)} Lot ≈ $${pipVal.toFixed(2)} / pip`;
      }
      el.querySelectorAll('.lot-chip').forEach((chip) => {
        const chipVal = parseFloat((chip as HTMLElement).dataset.lot || '0');
        if (Math.abs(chipVal - val) < 0.001) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    };

    qtyInput.addEventListener('input', () => {
      const val = Math.max(0.01, parseFloat(qtyInput.value) || 0.01);
      updateLotInfo(val);
    });

    el.querySelectorAll('.lot-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const lot = (chip as HTMLElement).dataset.lot || '1.00';
        qtyInput.value = lot;
        updateLotInfo(parseFloat(lot));
      });
    });

    el.querySelector('#lot-minus-btn')?.addEventListener('click', () => {
      let cur = parseFloat(qtyInput.value) || 1.0;
      cur = Math.max(0.01, cur <= 0.1 ? cur - 0.01 : cur <= 1 ? cur - 0.1 : cur - 0.5);
      qtyInput.value = cur.toFixed(2);
      updateLotInfo(cur);
    });

    el.querySelector('#lot-plus-btn')?.addEventListener('click', () => {
      let cur = parseFloat(qtyInput.value) || 1.0;
      cur = cur < 0.1 ? cur + 0.01 : cur < 1 ? cur + 0.1 : cur + 0.5;
      qtyInput.value = cur.toFixed(2);
      updateLotInfo(cur);
    });

    // Type switching
    el.querySelectorAll('.order-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.order-type-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const type = (btn as HTMLElement).dataset.type as 'MARKET' | 'LIMIT' | 'STOP';
        this.activeType = type;
        const priceGrp = el.querySelector<HTMLElement>('#order-price-group')!;
        priceGrp.style.display = type === 'MARKET' ? 'none' : 'block';
      });
    });

    // Collapse button
    el.querySelector('#trade-panel-collapse-btn')?.addEventListener('click', () => {
      this.collapse();
    });

    // Buy / Sell execution
    el.querySelector('#order-buy-btn')!.addEventListener('click', () => void this.submitOrder('BUY'));
    el.querySelector('#order-sell-btn')!.addEventListener('click', () => void this.submitOrder('SELL'));

    return el;
  }

  private async submitOrder(side: 'BUY' | 'SELL'): Promise<void> {
    const qty =
      parseFloat(this.container.querySelector<HTMLInputElement>('#order-qty-input')!.value) || 1.0;
    const priceVal =
      parseFloat(this.container.querySelector<HTMLInputElement>('#order-price-input')!.value) ||
      0.0;
    const slVal =
      parseFloat(this.container.querySelector<HTMLInputElement>('#order-sl-input')!.value) ||
      undefined;
    const tpVal =
      parseFloat(this.container.querySelector<HTMLInputElement>('#order-tp-input')!.value) ||
      undefined;

    const basePrice = this.currentPrice > 0 ? this.currentPrice : priceVal;
    const pipSize =
      basePrice > 1000 ? 1.0 : basePrice > 50 || this.currentSymbol.includes('JPY') ? 0.01 : 0.0001;

    let finalSl: number | undefined = undefined;
    if (slVal !== undefined && !isNaN(slVal) && slVal > 0) {
      if (basePrice < 50 && slVal >= 1.0 && slVal < 5000) {
        finalSl = +(side === 'BUY' ? basePrice - slVal * pipSize : basePrice + slVal * pipSize).toFixed(5);
      } else {
        finalSl = slVal;
      }
      if (finalSl !== undefined) {
        if (side === 'BUY' && (finalSl as number) >= basePrice) {
          finalSl = undefined;
        } else if (side === 'SELL' && (finalSl as number) <= basePrice) {
          finalSl = undefined;
        }
      }
    }

    let finalTp: number | undefined = undefined;
    if (tpVal !== undefined && !isNaN(tpVal) && tpVal > 0) {
      if (basePrice < 50 && tpVal >= 1.0 && tpVal < 5000) {
        finalTp = +(side === 'BUY' ? basePrice + tpVal * pipSize : basePrice - tpVal * pipSize).toFixed(5);
      } else {
        finalTp = tpVal;
      }
      if (finalTp !== undefined) {
        if (side === 'BUY' && (finalTp as number) <= basePrice) {
          finalTp = undefined;
        } else if (side === 'SELL' && (finalTp as number) >= basePrice) {
          finalTp = undefined;
        }
      }
    }

    const payload = {
      symbol: this.currentSymbol,
      side,
      order_type: this.activeType,
      quantity: qty,
      price: priceVal,
      stop_loss: finalSl,
      take_profit: finalTp,
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
        }
      } catch {
        /* ignore */
      }
    } else {
      if (this.onOrderPlaced) this.onOrderPlaced(payload);
    }
  }
}
