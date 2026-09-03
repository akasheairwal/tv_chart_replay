/**
 * Order Entry Panel UI — Exness WebTerminal style collapsible side trade panel with built-in Risk Calculator.
 */

import type { PythonBridge } from '../bridge/python-bridge';
import { calculateRiskMetrics } from '../trading/risk-calculator';
import type {
  AccountSummary,
  OrderDefinition,
  PositionDefinition,
  RiskUnit,
  SlInputMode,
  TpInputMode,
} from '../trading/trading-types';
import { getIcon } from './icons';

export class OrderPanel {
  private readonly container: HTMLElement;
  private currentSymbol = 'EURUSD';
  private currentPrice = 0.0;
  private spreadPips = 0.8;
  private activeType: 'MARKET' | 'LIMIT' | 'STOP' = 'MARKET';
  private positions: PositionDefinition[] = [];
  private onCollapseChange?: (collapsed: boolean) => void;

  // Exness Risk Calculator State
  private executionMode: 'LOTS' | 'RISK_CALCULATOR' = 'LOTS';
  private accountEquity = 10000.0;
  private riskUnit: RiskUnit = 'CURRENCY';
  private riskValue = 100.0; // $100 or 1.0%
  private slInputMode: SlInputMode = 'PIPS';
  private slValue = 20.0; // 20 pips
  private tpInputMode: TpInputMode = 'RR';
  private tpValue = 2.0; // 1:2 R:R
  private leverage = 100;
  private activeSide: 'BUY' | 'SELL' = 'BUY';

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
    this.updateRiskCalculation();
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
      this.updateRiskCalculation();
    }
  }

  setPositions(positions: PositionDefinition[]): void {
    this.positions = positions || [];
    this.updateSummary();
  }

  setAccountSummary(account: AccountSummary): void {
    if (account) {
      if (account.equity > 0) this.accountEquity = account.equity;
      this.updateRiskCalculation();
    }
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

  populateFromPositionDrawing(params: {
    side: 'BUY' | 'SELL';
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    lotSize: number;
  }): void {
    this.expand();
    this.activeSide = params.side;

    const buyBtn = this.container.querySelector('#order-side-buy');
    const sellBtn = this.container.querySelector('#order-side-sell');
    if (buyBtn && sellBtn) {
      buyBtn.classList.toggle('active', params.side === 'BUY');
      sellBtn.classList.toggle('active', params.side === 'SELL');
    }

    const priceInput = this.container.querySelector<HTMLInputElement>('#order-price-input');
    if (priceInput) priceInput.value = params.entryPrice.toFixed(4);

    const slInput = this.container.querySelector<HTMLInputElement>('#order-sl-input');
    if (slInput) slInput.value = params.slPrice.toFixed(4);

    const tpInput = this.container.querySelector<HTMLInputElement>('#order-tp-input');
    if (tpInput) tpInput.value = params.tpPrice.toFixed(4);

    const qtyInput = this.container.querySelector<HTMLInputElement>('#order-qty-input');
    if (qtyInput) qtyInput.value = params.lotSize.toFixed(2);

    this.updatePriceCards();
    this.updateSummary();
    this.updateRiskCalculation();
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

  private updateRiskCalculation(): void {
    if (this.executionMode !== 'RISK_CALCULATOR') return;

    const priceVal =
      parseFloat(this.container.querySelector<HTMLInputElement>('#order-price-input')?.value || '0') ||
      this.currentPrice;

    const res = calculateRiskMetrics({
      symbol: this.currentSymbol,
      side: this.activeSide,
      entryPrice: priceVal > 0 ? priceVal : 1.0,
      accountEquity: this.accountEquity,
      riskUnit: this.riskUnit,
      riskValue: this.riskValue,
      slMode: this.slInputMode,
      slValue: this.slValue,
      tpMode: this.tpInputMode,
      tpValue: this.tpValue,
      leverage: this.leverage,
    });

    // Update Lot info & auto qty field
    const qtyInput = this.container.querySelector<HTMLInputElement>('#order-qty-input');
    if (qtyInput) {
      qtyInput.value = res.calculatedLots.toFixed(2);
    }

    const lotInfo = this.container.querySelector<HTMLElement>('#order-lot-info');
    if (lotInfo) {
      lotInfo.textContent = `${res.calculatedLots.toFixed(2)} Lot ≈ $${res.pipValue.toFixed(2)} / pip`;
    }

    // Update Risk breakdown card
    const lotsBadge = this.container.querySelector('#rc-calc-lots');
    const riskBadge = this.container.querySelector('#rc-max-risk');
    const rewardBadge = this.container.querySelector('#rc-est-reward');
    const rrBadge = this.container.querySelector('#rc-rr-ratio');
    const marginBadge = this.container.querySelector('#rc-req-margin');
    const warningEl = this.container.querySelector<HTMLElement>('#rc-warning-banner');

    if (lotsBadge) lotsBadge.textContent = `${res.calculatedLots.toFixed(2)} Lots`;
    if (riskBadge) riskBadge.textContent = `$${res.riskAmount.toFixed(2)} (${res.riskPercent.toFixed(1)}%)`;
    if (rewardBadge) rewardBadge.textContent = `$${res.rewardAmount.toFixed(2)} (${res.rewardPercent.toFixed(1)}%)`;
    if (rrBadge) rrBadge.textContent = res.rrRatio > 0 ? `1 : ${res.rrRatio.toFixed(2)}` : '--';

    if (marginBadge) {
      marginBadge.textContent = `$${res.requiredMargin.toFixed(2)}`;
      marginBadge.className = `rc-metric-value ${res.marginWarning ? 'margin-warning' : ''}`;
    }

    if (warningEl) {
      if (!res.isValid && res.errorMessage) {
        warningEl.textContent = res.errorMessage;
        warningEl.style.display = 'block';
      } else if (res.marginWarning) {
        warningEl.textContent = `Warning: Required Margin ($${res.requiredMargin.toFixed(2)}) exceeds Account Equity!`;
        warningEl.style.display = 'block';
      } else {
        warningEl.style.display = 'none';
      }
    }

    // Sync calculated SL/TP to standard inputs if requested
    const slInput = this.container.querySelector<HTMLInputElement>('#order-sl-input');
    const tpInput = this.container.querySelector<HTMLInputElement>('#order-tp-input');

    if (slInput && res.slPrice !== null) {
      slInput.value = this.slInputMode === 'PIPS' ? res.slPips.toString() : res.slPrice.toString();
    }
    if (tpInput && res.tpPrice !== null) {
      tpInput.value = this.tpInputMode === 'RR' || this.tpInputMode === 'PIPS' ? res.tpPips.toString() : res.tpPrice.toString();
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
        <!-- Execution Mode Switcher (Exness Style) -->
        <div class="exness-mode-row">
          <button type="button" class="exness-mode-btn active" data-mode="LOTS">Volume (Lots)</button>
          <button type="button" class="exness-mode-btn" data-mode="RISK_CALCULATOR">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
              <rect x="4" y="2" width="16" height="20" rx="2"></rect>
              <line x1="8" y1="6" x2="16" y2="6"></line>
              <line x1="8" y1="10" x2="8" y2="10.01"></line>
              <line x1="12" y1="10" x2="12" y2="10.01"></line>
              <line x1="16" y1="10" x2="16" y2="10.01"></line>
              <line x1="8" y1="14" x2="8" y2="14.01"></line>
              <line x1="12" y1="14" x2="12" y2="14.01"></line>
              <line x1="16" y1="14" x2="16" y2="14.01"></line>
            </svg>
            Risk Calculator
          </button>
        </div>

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

        <!-- Risk Calculator Inputs Container (visible when mode === RISK_CALCULATOR) -->
        <div class="risk-calc-section" id="risk-calc-section" style="display: none;">
          <!-- Risk Target Input with $ / % unit pill -->
          <div class="order-field-group">
            <div class="order-field-header-row">
              <label class="order-field-label">Risk Target</label>
              <div class="unit-toggle-group">
                <button type="button" class="unit-toggle-btn active" data-unit="CURRENCY">$</button>
                <button type="button" class="unit-toggle-btn" data-unit="PERCENT">%</button>
              </div>
            </div>
            <div class="order-lot-stepper-row">
              <input class="order-field-input" id="rc-risk-input" type="number" step="any" value="100.00" min="0.1" />
            </div>
          </div>

          <!-- SL Input with Mode Chips -->
          <div class="order-field-group">
            <div class="order-field-header-row">
              <label class="order-field-label">Stop Loss Target</label>
              <div class="mode-chips-group" id="rc-sl-chips">
                <button type="button" class="mode-chip active" data-slmode="PIPS">Pips</button>
                <button type="button" class="mode-chip" data-slmode="PRICE">Price</button>
                <button type="button" class="mode-chip" data-slmode="CURRENCY">$</button>
              </div>
            </div>
            <input class="order-field-input" id="rc-sl-input" type="number" step="any" value="20.0" placeholder="SL Pips / Price" />
          </div>

          <!-- TP Input with Mode Chips & R:R Presets -->
          <div class="order-field-group">
            <div class="order-field-header-row">
              <label class="order-field-label">Take Profit Target</label>
              <div class="mode-chips-group" id="rc-tp-chips">
                <button type="button" class="mode-chip active" data-tpmode="RR">R : R</button>
                <button type="button" class="mode-chip" data-tpmode="PIPS">Pips</button>
                <button type="button" class="mode-chip" data-tpmode="PRICE">Price</button>
              </div>
            </div>
            <input class="order-field-input" id="rc-tp-input" type="number" step="any" value="2.0" placeholder="R:R Ratio (e.g. 2.0)" />

            <!-- R:R Quick Preset Chips -->
            <div class="rr-presets-row" id="rc-rr-presets">
              <span class="rr-preset-label">R:R Presets:</span>
              <button type="button" class="rr-chip" data-rr="1">1:1</button>
              <button type="button" class="rr-chip" data-rr="1.5">1:1.5</button>
              <button type="button" class="rr-chip active" data-rr="2">1:2</button>
              <button type="button" class="rr-chip" data-rr="3">1:3</button>
              <button type="button" class="rr-chip" data-rr="5">1:5</button>
            </div>
          </div>

          <!-- Account Leverage Selector -->
          <div class="order-field-group">
            <label class="order-field-label">Leverage</label>
            <select class="order-field-input select-input" id="rc-leverage-select">
              <option value="20">1 : 20</option>
              <option value="50">1 : 50</option>
              <option value="100" selected>1 : 100 (Default)</option>
              <option value="200">1 : 200</option>
              <option value="500">1 : 500</option>
            </select>
          </div>

          <!-- Exness Risk Metrics Breakdown Summary Card -->
          <div class="rc-metrics-card">
            <div class="rc-card-header">
              <span class="rc-card-title">RISK & MARGIN BREAKDOWN</span>
              <span class="rc-lots-badge" id="rc-calc-lots">0.50 Lots</span>
            </div>
            <div class="rc-metrics-grid">
              <div class="rc-metric-item">
                <span class="rc-metric-label">Max Risk ($ / %)</span>
                <span class="rc-metric-value risk-red" id="rc-max-risk">$100.00 (1.0%)</span>
              </div>
              <div class="rc-metric-item">
                <span class="rc-metric-label">Est. Reward ($ / %)</span>
                <span class="rc-metric-value reward-green" id="rc-est-reward">$200.00 (2.0%)</span>
              </div>
              <div class="rc-metric-item">
                <span class="rc-metric-label">Risk : Reward</span>
                <span class="rc-metric-value" id="rc-rr-ratio">1 : 2.00</span>
              </div>
              <div class="rc-metric-item">
                <span class="rc-metric-label">Required Margin</span>
                <span class="rc-metric-value" id="rc-req-margin">$542.50</span>
              </div>
            </div>
            <div class="rc-warning-banner" id="rc-warning-banner" style="display: none;"></div>
          </div>
        </div>

        <!-- Lot size selector with chips and stepper (Visible in LOTS mode) -->
        <div class="order-field-group" id="standard-lot-section">
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

        <!-- SL & TP Fields (Standard Mode) -->
        <div class="order-field-row sl-tp-row" id="standard-sltp-section">
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

    // Execution Mode Tabs (Volume vs Risk Calculator)
    el.querySelectorAll('.exness-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.exness-mode-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = (btn as HTMLElement).dataset.mode as 'LOTS' | 'RISK_CALCULATOR';
        this.executionMode = mode;

        const riskSection = el.querySelector<HTMLElement>('#risk-calc-section')!;
        const stdLotSection = el.querySelector<HTMLElement>('#standard-lot-section')!;
        const stdSlTpSection = el.querySelector<HTMLElement>('#standard-sltp-section')!;

        if (mode === 'RISK_CALCULATOR') {
          riskSection.style.display = 'block';
          stdLotSection.style.display = 'none';
          stdSlTpSection.style.display = 'none';
          this.updateRiskCalculation();
        } else {
          riskSection.style.display = 'none';
          stdLotSection.style.display = 'block';
          stdSlTpSection.style.display = 'flex';
        }
      });
    });

    // Risk Unit Toggle ($ vs %)
    el.querySelectorAll('.unit-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.unit-toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const unit = (btn as HTMLElement).dataset.unit as RiskUnit;
        this.riskUnit = unit;
        const input = el.querySelector<HTMLInputElement>('#rc-risk-input')!;
        if (unit === 'PERCENT') {
          this.riskValue = 1.0;
          input.value = '1.00';
        } else {
          this.riskValue = 100.0;
          input.value = '100.00';
        }
        this.updateRiskCalculation();
      });
    });

    el.querySelector('#rc-risk-input')?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value) || 0;
      this.riskValue = val;
      this.updateRiskCalculation();
    });

    // SL Mode Chips
    el.querySelectorAll('#rc-sl-chips .mode-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        el.querySelectorAll('#rc-sl-chips .mode-chip').forEach((b) => b.classList.remove('active'));
        chip.classList.add('active');
        const slMode = (chip as HTMLElement).dataset.slmode as SlInputMode;
        this.slInputMode = slMode;
        const input = el.querySelector<HTMLInputElement>('#rc-sl-input')!;
        if (slMode === 'PIPS') {
          input.value = '20.0';
          input.placeholder = 'Pips (e.g. 20)';
          this.slValue = 20.0;
        } else if (slMode === 'PRICE') {
          input.value = this.currentPrice > 0 ? (this.currentPrice * 0.998).toFixed(4) : '';
          input.placeholder = 'Price Target';
          this.slValue = parseFloat(input.value) || 0;
        } else if (slMode === 'CURRENCY') {
          input.value = '100.00';
          input.placeholder = 'Max Loss ($)';
          this.slValue = 100.0;
        }
        this.updateRiskCalculation();
      });
    });

    el.querySelector('#rc-sl-input')?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value) || 0;
      this.slValue = val;
      this.updateRiskCalculation();
    });

    // TP Mode Chips
    el.querySelectorAll('#rc-tp-chips .mode-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        el.querySelectorAll('#rc-tp-chips .mode-chip').forEach((b) => b.classList.remove('active'));
        chip.classList.add('active');
        const tpMode = (chip as HTMLElement).dataset.tpmode as TpInputMode;
        this.tpInputMode = tpMode;
        const input = el.querySelector<HTMLInputElement>('#rc-tp-input')!;
        const presetsRow = el.querySelector<HTMLElement>('#rc-rr-presets')!;

        if (tpMode === 'RR') {
          input.value = '2.0';
          input.placeholder = 'R:R Ratio (e.g. 2.0)';
          presetsRow.style.display = 'flex';
          this.tpValue = 2.0;
        } else {
          presetsRow.style.display = 'none';
          if (tpMode === 'PIPS') {
            input.value = '40.0';
            input.placeholder = 'Pips (e.g. 40)';
            this.tpValue = 40.0;
          } else if (tpMode === 'PRICE') {
            input.value = this.currentPrice > 0 ? (this.currentPrice * 1.004).toFixed(4) : '';
            input.placeholder = 'Price Target';
            this.tpValue = parseFloat(input.value) || 0;
          }
        }
        this.updateRiskCalculation();
      });
    });

    el.querySelector('#rc-tp-input')?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value) || 0;
      this.tpValue = val;
      this.updateRiskCalculation();
    });

    // R:R Quick Preset Chips
    el.querySelectorAll('.rr-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        el.querySelectorAll('.rr-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const rr = parseFloat((chip as HTMLElement).dataset.rr || '2');
        this.tpValue = rr;
        const input = el.querySelector<HTMLInputElement>('#rc-tp-input')!;
        input.value = rr.toString();
        this.updateRiskCalculation();
      });
    });

    // Leverage select
    el.querySelector('#rc-leverage-select')?.addEventListener('change', (e) => {
      const lev = parseInt((e.target as HTMLSelectElement).value, 10) || 100;
      this.leverage = lev;
      this.updateRiskCalculation();
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
        this.updateRiskCalculation();
      });
    });

    // Collapse button
    el.querySelector('#trade-panel-collapse-btn')?.addEventListener('click', () => {
      this.collapse();
    });

    // Buy / Sell execution
    el.querySelector('#order-buy-btn')!.addEventListener('click', () => {
      this.activeSide = 'BUY';
      this.updateRiskCalculation();
      void this.submitOrder('BUY');
    });

    el.querySelector('#order-sell-btn')!.addEventListener('click', () => {
      this.activeSide = 'SELL';
      this.updateRiskCalculation();
      void this.submitOrder('SELL');
    });

    return el;
  }

  private async submitOrder(side: 'BUY' | 'SELL'): Promise<void> {
    this.activeSide = side;

    let qty = parseFloat(this.container.querySelector<HTMLInputElement>('#order-qty-input')!.value) || 1.0;
    const priceVal = parseFloat(this.container.querySelector<HTMLInputElement>('#order-price-input')!.value) || 0.0;
    const basePrice = this.currentPrice > 0 ? this.currentPrice : priceVal;

    let finalSl: number | undefined = undefined;
    let finalTp: number | undefined = undefined;

    if (this.executionMode === 'RISK_CALCULATOR') {
      const res = calculateRiskMetrics({
        symbol: this.currentSymbol,
        side,
        entryPrice: basePrice > 0 ? basePrice : 1.0,
        accountEquity: this.accountEquity,
        riskUnit: this.riskUnit,
        riskValue: this.riskValue,
        slMode: this.slInputMode,
        slValue: this.slValue,
        tpMode: this.tpInputMode,
        tpValue: this.tpValue,
        leverage: this.leverage,
      });

      qty = res.calculatedLots;
      if (res.slPrice !== null) finalSl = res.slPrice;
      if (res.tpPrice !== null) finalTp = res.tpPrice;
    } else {
      const slVal = parseFloat(this.container.querySelector<HTMLInputElement>('#order-sl-input')!.value) || undefined;
      const tpVal = parseFloat(this.container.querySelector<HTMLInputElement>('#order-tp-input')!.value) || undefined;
      const pipSize = basePrice > 1000 ? 1.0 : basePrice > 50 || this.currentSymbol.includes('JPY') ? 0.01 : 0.0001;

      if (slVal !== undefined && !isNaN(slVal) && slVal > 0) {
        const isNearPrice = basePrice > 0 && Math.abs(slVal - basePrice) / basePrice < 0.35;
        if (isNearPrice || this.slInputMode === 'PRICE') {
          finalSl = slVal;
        } else {
          finalSl = +(side === 'BUY' ? basePrice - slVal * pipSize : basePrice + slVal * pipSize).toFixed(5);
        }
      }

      if (tpVal !== undefined && !isNaN(tpVal) && tpVal > 0) {
        const isNearPrice = basePrice > 0 && Math.abs(tpVal - basePrice) / basePrice < 0.35;
        if (isNearPrice || this.tpInputMode === 'PRICE') {
          finalTp = tpVal;
        } else {
          finalTp = +(side === 'BUY' ? basePrice + tpVal * pipSize : basePrice - tpVal * pipSize).toFixed(5);
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
