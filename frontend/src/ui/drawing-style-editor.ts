import type { DrawingEngine } from '../drawings/drawing-engine';
import type { DrawingDefinition, DrawingStyle, DrawingType } from '../drawings/drawing-types';
import { calculatePositionMetrics, calculateFinancialPosition } from '../drawings/drawing-math';
import { getIcon } from './icons';

const COLOR_PRESETS = [
  '#2962ff', // Blue
  '#089981', // Green
  '#f23645', // Red
  '#ff9800', // Orange
  '#ab47bc', // Purple
  '#ffffff', // White
];

export class DrawingStyleEditor {
  private el: HTMLElement;
  private currentDrawing: DrawingDefinition | null = null;
  private activeTool: DrawingType | null = null;
  public onCreateOrder?: (params: {
    side: 'BUY' | 'SELL';
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    lotSize: number;
  }) => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly engine: DrawingEngine,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'drawing-style-editor tv-floating-style';
    this.el.style.display = 'none';
    this.container.appendChild(this.el);
  }

  show(drawing: DrawingDefinition): void {
    this.currentDrawing = drawing;
    this.activeTool = null;
    this.render();
    this.el.style.display = 'flex';
  }

  showForTool(tool: DrawingType): void {
    if (tool === 'cursor') {
      this.hide();
      return;
    }
    this.activeTool = tool;
    this.currentDrawing = null;
    this.render();
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.currentDrawing = null;
    this.activeTool = null;
    this.el.style.display = 'none';
  }

  openSettingsDialog(drawing: DrawingDefinition): void {
    this.currentDrawing = drawing;
    this.activeTool = null;
    this.renderSettingsModal(drawing);
  }

  private updateStyle(styleUpdates: Partial<DrawingStyle>): void {
    if (this.currentDrawing) {
      this.engine.updateDrawingStyle(this.currentDrawing.id, styleUpdates);
      this.currentDrawing = this.engine.getSelectedDrawing();
    } else if (this.activeTool) {
      this.engine.updateToolDefaultStyle(this.activeTool, styleUpdates);
    }
    this.render();
  }

  private render(): void {
    if (!this.currentDrawing && !this.activeTool) return;

    const dType = this.currentDrawing ? this.currentDrawing.type : this.activeTool!;
    const style = this.currentDrawing
      ? this.currentDrawing.style
      : this.engine.getToolDefaultStyle(this.activeTool!);

    this.el.innerHTML = '';

    // Title / Type badge
    const badge = document.createElement('span');
    badge.className = 'style-editor-badge';
    badge.textContent = this.currentDrawing
      ? dType.replace(/_/g, ' ').toUpperCase()
      : `${dType.replace(/_/g, ' ').toUpperCase()} PRESET`;
    this.el.appendChild(badge);

    this.addSep();

    // 1. Color Presets
    const colorGroup = document.createElement('div');
    colorGroup.className = 'style-btn-group';

    for (const color of COLOR_PRESETS) {
      const swatch = document.createElement('button');
      swatch.className = `style-color-swatch ${style.color === color ? 'active' : ''}`;
      swatch.style.backgroundColor = color;
      swatch.title = `Color: ${color}`;
      swatch.addEventListener('click', () => {
        this.updateStyle({ color });
      });
      colorGroup.appendChild(swatch);
    }

    // Native color input picker
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'style-color-input';
    colorPicker.value = style.color || '#2962ff';
    colorPicker.title = 'Custom Color';
    colorPicker.addEventListener('input', () => {
      this.updateStyle({ color: colorPicker.value });
    });
    colorGroup.appendChild(colorPicker);
    this.el.appendChild(colorGroup);

    this.addSep();

    // 2. Line Width
    const widthGroup = document.createElement('div');
    widthGroup.className = 'style-btn-group';
    for (const w of [1, 2, 3, 4]) {
      const btn = document.createElement('button');
      btn.className = `style-prop-btn ${style.width === w ? 'active' : ''}`;
      btn.textContent = `${w}px`;
      btn.title = `Line Width: ${w}px`;
      btn.addEventListener('click', () => {
        this.updateStyle({ width: w });
      });
      widthGroup.appendChild(btn);
    }
    this.el.appendChild(widthGroup);

    this.addSep();

    // 3. Line Style (Solid / Dashed / Dotted)
    const styleGroup = document.createElement('div');
    styleGroup.className = 'style-btn-group';
    const styles: Array<{ id: 'solid' | 'dashed' | 'dotted'; label: string }> = [
      { id: 'solid', label: '—' },
      { id: 'dashed', label: '---' },
      { id: 'dotted', label: '···' },
    ];
    for (const s of styles) {
      const btn = document.createElement('button');
      btn.className = `style-prop-btn ${(style.lineStyle || 'solid') === s.id ? 'active' : ''}`;
      btn.textContent = s.label;
      btn.title = `Line Style: ${s.id}`;
      btn.addEventListener('click', () => {
        this.updateStyle({ lineStyle: s.id });
      });
      styleGroup.appendChild(btn);
    }
    this.el.appendChild(styleGroup);

    if (this.currentDrawing) {
      const d = this.currentDrawing;

      // 4. Special Position Controls for Long / Short position
      if (d.type === 'long_position' || d.type === 'short_position') {
        this.addSep();

        // Quick Order Button
        const orderBtn = document.createElement('button');
        orderBtn.className = 'style-action-btn trade-btn';
        orderBtn.innerHTML = `⚡ Order`;
        orderBtn.title = 'Create Order in Trade Panel using tool SL/TP/Lots';
        orderBtn.addEventListener('click', () => {
          this.executeTradeFromDrawing(d);
        });
        this.el.appendChild(orderBtn);

        // Settings Modal Button
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'style-action-btn settings-btn';
        settingsBtn.innerHTML = `⚙️`;
        settingsBtn.title = 'Position Settings & Risk Inputs';
        settingsBtn.addEventListener('click', () => {
          this.renderSettingsModal(d);
        });
        this.el.appendChild(settingsBtn);

        // Compact Stats Toggle
        const compactBtn = document.createElement('button');
        compactBtn.className = `style-action-btn ${d.style.compactStats ? 'active' : ''}`;
        compactBtn.innerHTML = `📊`;
        compactBtn.title = 'Toggle Compact Statistics Badge';
        compactBtn.addEventListener('click', () => {
          const compactStats = !d.style.compactStats;
          this.updateStyle({ compactStats });
        });
        this.el.appendChild(compactBtn);
      }

      // 5. Text Input (if drawing has text/callout)
      if (d.type === 'text' || d.type === 'callout') {
        this.addSep();
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'style-text-input';
        textInput.value = d.style.text || '';
        textInput.placeholder = 'Label text…';
        textInput.addEventListener('input', () => {
          this.updateStyle({ text: textInput.value });
        });
        this.el.appendChild(textInput);
      }

      this.addSep();

      // 6. Actions: Lock, Visibility, Duplicate, Delete
      const actionsGroup = document.createElement('div');
      actionsGroup.className = 'style-btn-group';

      // Lock toggle
      const lockBtn = document.createElement('button');
      lockBtn.className = `style-action-btn ${d.locked ? 'active' : ''}`;
      lockBtn.innerHTML = d.locked ? getIcon('lock') : getIcon('unlock');
      lockBtn.title = d.locked ? 'Unlock Drawing' : 'Lock Drawing (Prevent Moves)';
      lockBtn.addEventListener('click', () => {
        this.engine.toggleLock(d.id);
        this.currentDrawing = this.engine.getSelectedDrawing();
        this.render();
      });
      actionsGroup.appendChild(lockBtn);

      // Visibility toggle
      const visBtn = document.createElement('button');
      visBtn.className = `style-action-btn ${!d.visible ? 'active' : ''}`;
      visBtn.innerHTML = d.visible ? getIcon('eye') : getIcon('eye_off');
      visBtn.title = d.visible ? 'Hide Drawing' : 'Show Drawing';
      visBtn.addEventListener('click', () => {
        this.engine.toggleVisibility(d.id);
        this.currentDrawing = this.engine.getSelectedDrawing();
        this.render();
      });
      actionsGroup.appendChild(visBtn);

      // Duplicate
      const dupBtn = document.createElement('button');
      dupBtn.className = 'style-action-btn';
      dupBtn.innerHTML = getIcon('list');
      dupBtn.title = 'Duplicate Drawing';
      dupBtn.addEventListener('click', () => {
        this.engine.duplicateDrawing(d.id);
      });
      actionsGroup.appendChild(dupBtn);

      // Delete
      const delBtn = document.createElement('button');
      delBtn.className = 'style-action-btn delete';
      delBtn.innerHTML = getIcon('trash');
      delBtn.title = 'Delete Drawing (Del)';
      delBtn.addEventListener('click', () => {
        this.engine.deleteDrawing(d.id);
        this.hide();
      });
      actionsGroup.appendChild(delBtn);

      this.el.appendChild(actionsGroup);
    }
  }

  private executeTradeFromDrawing(d: DrawingDefinition): void {
    if (!this.onCreateOrder) return;
    const metrics = calculatePositionMetrics(d.type as 'long_position' | 'short_position', d.points, d.style);
    this.onCreateOrder({
      side: metrics.isLong ? 'BUY' : 'SELL',
      entryPrice: metrics.entryPrice,
      slPrice: metrics.slPrice,
      tpPrice: metrics.tpPrice,
      lotSize: metrics.lotSize,
    });
  }

  private renderSettingsModal(d: DrawingDefinition): void {
    const existing = document.getElementById('pos-settings-modal-overlay');
    if (existing) existing.remove();

    const isPosition = d.type === 'long_position' || d.type === 'short_position';
    const isLong = d.type === 'long_position';
    const metrics = isPosition
      ? calculatePositionMetrics(d.type as any, d.points, d.style)
      : null;

    const overlay = document.createElement('div');
    overlay.id = 'pos-settings-modal-overlay';
    overlay.className = 'tv-modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'tv-modal-container pos-settings-dialog';

    if (isPosition && metrics) {
      dialog.innerHTML = `
        <div class="tv-modal-header">
          <div class="tv-modal-title">
            <span class="pos-badge ${isLong ? 'long' : 'short'}">${isLong ? '🟢 LONG' : '🔴 SHORT'} POSITION SETTINGS</span>
            <span class="pos-sym-subtitle">${d.symbol} · ${d.timeframe}</span>
          </div>
          <button class="tv-modal-close" id="pos-modal-close">✕</button>
        </div>

        <div class="tv-modal-tabs">
          <button class="tv-modal-tab active" id="tab-btn-inputs" type="button">Inputs</button>
          <button class="tv-modal-tab" id="tab-btn-style" type="button">Style</button>
        </div>

        <div class="tv-modal-body">
          <div class="pos-tab-panel" id="panel-inputs" style="display: block;">
            <div class="pos-input-grid">
              <div class="pos-field-group">
                <label>Account Size ($):</label>
                <input type="number" id="inp-acc-size" value="${d.style.accountSize || 10000}" step="500" min="100">
              </div>

              <div class="pos-field-group">
                <label>Account Currency:</label>
                <input type="text" id="inp-acc-currency" value="${d.style.accountCurrency || 'USD'}" maxlength="6">
              </div>

              <div class="pos-field-group">
                <label>Risk Mode:</label>
                <select id="inp-risk-mode">
                  <option value="PERCENT" ${(d.style.riskMode || 'PERCENT') === 'PERCENT' ? 'selected' : ''}>% of Account</option>
                  <option value="CASH" ${d.style.riskMode === 'CASH' ? 'selected' : ''}>$ Cash Amount</option>
                </select>
              </div>

              <div class="pos-field-group">
                <label id="inp-risk-val-label">${d.style.riskMode === 'CASH' ? 'Risk Amount ($):' : 'Risk Percentage (%):'}</label>
                <input type="number" id="inp-risk-val" value="${d.style.riskMode === 'CASH' ? d.style.riskAmount || 100 : d.style.riskPercent || 1.0}" step="0.1" min="0.01">
              </div>

              <div class="pos-field-group">
                <label>Entry Price:</label>
                <input type="number" id="inp-entry-price" value="${d.points[0].price}" step="0.0001">
              </div>

              <div class="pos-field-group">
                <label>Account Leverage:</label>
                <select id="inp-leverage">
                  ${[1, 2, 5, 10, 20, 30, 50, 100].map((lev) => `<option value="${lev}" ${(d.style.leverage ?? 1) === lev ? 'selected' : ''}>${lev}x</option>`).join('')}
                </select>
              </div>

              <div class="pos-field-group">
                <label>Take Profit Target:</label>
                <input type="number" id="inp-tp-price" value="${metrics.tpPrice}" step="0.0001">
              </div>

              <div class="pos-field-group">
                <label>Stop Loss Target:</label>
                <input type="number" id="inp-sl-price" value="${metrics.slPrice}" step="0.0001">
              </div>
            </div>

            <div class="pos-summary-card">
              <div class="pos-card-row">
                <span>Calculated Lot Size:</span>
                <strong id="card-lots">${metrics.lotSize.toFixed(2)} Lots</strong>
              </div>
              <div class="pos-card-row">
                <span>Risk / Reward Ratio:</span>
                <strong id="card-rr">1 : ${metrics.rrRatio}</strong>
              </div>
              <div class="pos-card-row">
                <span>Max Risk:</span>
                <span class="text-red" id="card-risk">-$${metrics.lossDollar.toFixed(2)} (-${metrics.slPips.toFixed(1)} pips)</span>
              </div>
              <div class="pos-card-row">
                <span>Estimated Profit:</span>
                <span class="text-green" id="card-profit">+$${metrics.profitDollar.toFixed(2)} (+${metrics.tpPips.toFixed(1)} pips)</span>
              </div>
              <div class="pos-card-row" id="card-margin-row" style="display: ${metrics.isMarginExceeded ? 'flex' : 'none'};">
                <span style="color: #ff9800; font-weight: 700;">⚠️ Margin Alert:</span>
                <span style="color: #ff9800; font-weight: 600;">Margin Required > Equity</span>
              </div>
            </div>
          </div>

          <div class="pos-tab-panel" id="panel-style" style="display: none;">
            <div class="pos-input-grid">
              <div class="pos-field-group">
                <label>Target Zone Color:</label>
                <input type="color" id="inp-target-color" value="${d.style.targetColor || '#089981'}">
              </div>

              <div class="pos-field-group">
                <label>Target Opacity:</label>
                <div class="pos-slider-row">
                  <input type="range" id="inp-target-opacity" min="0" max="100" value="${Math.round((d.style.targetOpacity ?? 0.20) * 100)}">
                  <span class="pos-slider-val" id="val-target-opacity">${Math.round((d.style.targetOpacity ?? 0.20) * 100)}%</span>
                </div>
              </div>

              <div class="pos-field-group">
                <label>Stop Zone Color:</label>
                <input type="color" id="inp-stop-color" value="${d.style.stopColor || '#f23645'}">
              </div>

              <div class="pos-field-group">
                <label>Stop Opacity:</label>
                <div class="pos-slider-row">
                  <input type="range" id="inp-stop-opacity" min="0" max="100" value="${Math.round((d.style.stopOpacity ?? 0.20) * 100)}">
                  <span class="pos-slider-val" id="val-stop-opacity">${Math.round((d.style.stopOpacity ?? 0.20) * 100)}%</span>
                </div>
              </div>

              <div class="pos-field-group">
                <label>Entry Line Color:</label>
                <input type="color" id="inp-entry-color" value="${d.style.color || '#2962ff'}">
              </div>

              <div class="pos-field-group">
                <label>Line Width:</label>
                <select id="inp-line-width">
                  <option value="1" ${d.style.width === 1 ? 'selected' : ''}>1px</option>
                  <option value="2" ${d.style.width === 2 ? 'selected' : ''}>2px</option>
                  <option value="3" ${d.style.width === 3 ? 'selected' : ''}>3px</option>
                </select>
              </div>
            </div>

            <div class="pos-checkbox-list">
              <label class="pos-checkbox-group">
                <input type="checkbox" id="inp-show-prices" ${d.style.showPrices !== false ? 'checked' : ''}>
                Show Price Labels on Axis
              </label>
              <label class="pos-checkbox-group">
                <input type="checkbox" id="inp-always-show-stats" ${d.style.alwaysShowStats ? 'checked' : ''}>
                Always Show Stats (even when unselected)
              </label>
              <label class="pos-checkbox-group">
                <input type="checkbox" id="inp-compact-stats" ${d.style.compactStats ? 'checked' : ''}>
                Compact Statistics View
              </label>
            </div>
          </div>
        </div>

        <div class="tv-modal-footer">
          <button class="tv-modal-btn trade" id="pos-modal-trade">⚡ Create Order</button>
          <div class="tv-modal-footer-right">
            <button class="tv-modal-btn cancel" id="pos-modal-cancel">Cancel</button>
            <button class="tv-modal-btn save" id="pos-modal-save">Save Settings</button>
          </div>
        </div>
      `;

      // Tab listeners
      const tabBtnInputs = dialog.querySelector<HTMLButtonElement>('#tab-btn-inputs');
      const tabBtnStyle = dialog.querySelector<HTMLButtonElement>('#tab-btn-style');
      const panelInputs = dialog.querySelector<HTMLElement>('#panel-inputs');
      const panelStyle = dialog.querySelector<HTMLElement>('#panel-style');

      tabBtnInputs?.addEventListener('click', () => {
        tabBtnInputs.classList.add('active');
        tabBtnStyle?.classList.remove('active');
        if (panelInputs) panelInputs.style.display = 'block';
        if (panelStyle) panelStyle.style.display = 'none';
      });

      tabBtnStyle?.addEventListener('click', () => {
        tabBtnStyle.classList.add('active');
        tabBtnInputs?.classList.remove('active');
        if (panelInputs) panelInputs.style.display = 'none';
        if (panelStyle) panelStyle.style.display = 'block';
      });

      // Opacity slider percentage readouts
      const inpTargetOpacity = dialog.querySelector<HTMLInputElement>('#inp-target-opacity');
      const valTargetOpacity = dialog.querySelector<HTMLElement>('#val-target-opacity');
      inpTargetOpacity?.addEventListener('input', () => {
        if (valTargetOpacity) valTargetOpacity.textContent = `${inpTargetOpacity.value}%`;
      });

      const inpStopOpacity = dialog.querySelector<HTMLInputElement>('#inp-stop-opacity');
      const valStopOpacity = dialog.querySelector<HTMLElement>('#val-stop-opacity');
      inpStopOpacity?.addEventListener('input', () => {
        if (valStopOpacity) valStopOpacity.textContent = `${inpStopOpacity.value}%`;
      });

      // Real-time live updating of risk analytics card
      const updateSummaryCard = () => {
        const accSize = parseFloat(dialog.querySelector<HTMLInputElement>('#inp-acc-size')?.value || '10000');
        const riskMode = (dialog.querySelector<HTMLSelectElement>('#inp-risk-mode')?.value || 'PERCENT') as 'PERCENT' | 'CASH';
        const riskVal = parseFloat(dialog.querySelector<HTMLInputElement>('#inp-risk-val')?.value || '1.0');
        const entryPx = parseFloat(dialog.querySelector<HTMLInputElement>('#inp-entry-price')?.value || d.points[0]?.price?.toString() || '1.0');
        const tpPx = parseFloat(dialog.querySelector<HTMLInputElement>('#inp-tp-price')?.value || (d.points[1]?.price ?? entryPx * 1.02).toString());
        const slPx = parseFloat(dialog.querySelector<HTMLInputElement>('#inp-sl-price')?.value || (d.points[2]?.price ?? entryPx * 0.99).toString());
        const leverageVal = parseFloat(dialog.querySelector<HTMLSelectElement>('#inp-leverage')?.value || '1');

        const liveMetrics = calculateFinancialPosition({
          type: d.type as 'long_position' | 'short_position',
          entryPrice: entryPx,
          tpPrice: tpPx,
          slPrice: slPx,
          accountSize: accSize,
          riskMode,
          riskPercent: riskMode === 'PERCENT' ? riskVal : undefined,
          riskAmount: riskMode === 'CASH' ? riskVal : undefined,
          leverage: leverageVal,
          symbol: d.symbol,
        });

        const cardLots = dialog.querySelector('#card-lots');
        const cardRr = dialog.querySelector('#card-rr');
        const cardRisk = dialog.querySelector('#card-risk');
        const cardProfit = dialog.querySelector('#card-profit');
        const cardMarginRow = dialog.querySelector<HTMLElement>('#card-margin-row');

        if (cardLots) cardLots.textContent = `${liveMetrics.lotSize.toFixed(2)} Lots`;
        if (cardRr) cardRr.textContent = `1 : ${liveMetrics.rrRatio}`;
        if (cardRisk) cardRisk.textContent = `-$${liveMetrics.lossDollar.toFixed(2)} (-${liveMetrics.slPips.toFixed(1)} pips)`;
        if (cardProfit) cardProfit.textContent = `+$${liveMetrics.profitDollar.toFixed(2)} (+${liveMetrics.tpPips.toFixed(1)} pips)`;
        if (cardMarginRow) {
          cardMarginRow.style.display = liveMetrics.isMarginExceeded ? 'flex' : 'none';
        }
      };

      // Risk mode toggle update
      const modeSelect = dialog.querySelector<HTMLSelectElement>('#inp-risk-mode');
      const valLabel = dialog.querySelector('#inp-risk-val-label');
      if (modeSelect && valLabel) {
        modeSelect.addEventListener('change', () => {
          valLabel.textContent =
            modeSelect.value === 'CASH' ? 'Risk Amount ($):' : 'Risk Percentage (%):';
          updateSummaryCard();
        });
      }

      const inputIds = [
        '#inp-acc-size',
        '#inp-risk-val',
        '#inp-entry-price',
        '#inp-tp-price',
        '#inp-sl-price',
        '#inp-leverage',
      ];
      for (const id of inputIds) {
        const inputEl = dialog.querySelector(id);
        inputEl?.addEventListener('input', updateSummaryCard);
        inputEl?.addEventListener('change', updateSummaryCard);
      }

      // Close handlers
      dialog.querySelector('#pos-modal-close')?.addEventListener('click', () => overlay.remove());
      dialog.querySelector('#pos-modal-cancel')?.addEventListener('click', () => overlay.remove());

      // Trade handler
      dialog.querySelector('#pos-modal-trade')?.addEventListener('click', () => {
        overlay.remove();
        this.executeTradeFromDrawing(d);
      });

      // Save Handler
      dialog.querySelector('#pos-modal-save')?.addEventListener('click', () => {
        const accSize = parseFloat(dialog.querySelector<HTMLInputElement>('#inp-acc-size')?.value || '10000');
        const accCurrency = dialog.querySelector<HTMLInputElement>('#inp-acc-currency')?.value || 'USD';
        const riskMode = (dialog.querySelector<HTMLSelectElement>('#inp-risk-mode')?.value || 'PERCENT') as 'PERCENT' | 'CASH';
        const riskVal = parseFloat(dialog.querySelector<HTMLInputElement>('#inp-risk-val')?.value || '1.0');
        const entryPx = parseFloat(dialog.querySelector<HTMLInputElement>('#inp-entry-price')?.value || d.points[0].price.toString());
        const tpPx = parseFloat(dialog.querySelector<HTMLInputElement>('#inp-tp-price')?.value || (d.points[1]?.price ?? entryPx).toString());
        const slPx = parseFloat(dialog.querySelector<HTMLInputElement>('#inp-sl-price')?.value || (d.points[2]?.price ?? entryPx).toString());
        const leverageVal = parseFloat(dialog.querySelector<HTMLSelectElement>('#inp-leverage')?.value || '1');

        let finalTpPx = tpPx;
        let finalSlPx = slPx;
        const minGap = (entryPx > 1000 ? 1.0 : entryPx > 50 ? 0.01 : 0.0001) * 0.5;

        if (isLong) {
          finalTpPx = Math.max(entryPx + minGap, tpPx);
          finalSlPx = Math.min(entryPx - minGap, slPx);
        } else {
          finalTpPx = Math.min(entryPx - minGap, tpPx);
          finalSlPx = Math.max(entryPx + minGap, slPx);
        }

        d.points[0].price = entryPx;
        if (!d.points[1]) d.points[1] = { ...d.points[0] };
        d.points[1].price = finalTpPx;
        if (!d.points[2]) d.points[2] = { ...d.points[0] };
        d.points[2].price = finalSlPx;

        const targetColor = dialog.querySelector<HTMLInputElement>('#inp-target-color')?.value || d.style.targetColor || '#089981';
        const stopColor = dialog.querySelector<HTMLInputElement>('#inp-stop-color')?.value || d.style.stopColor || '#f23645';
        const entryColor = dialog.querySelector<HTMLInputElement>('#inp-entry-color')?.value || d.style.color || '#2962ff';
        const lineWidth = parseInt(dialog.querySelector<HTMLSelectElement>('#inp-line-width')?.value || '2', 10);
        const targetOpacity = (parseInt(dialog.querySelector<HTMLInputElement>('#inp-target-opacity')?.value || '20', 10)) / 100;
        const stopOpacity = (parseInt(dialog.querySelector<HTMLInputElement>('#inp-stop-opacity')?.value || '20', 10)) / 100;

        const showPrices = dialog.querySelector<HTMLInputElement>('#inp-show-prices')?.checked ?? true;
        const alwaysShowStats = dialog.querySelector<HTMLInputElement>('#inp-always-show-stats')?.checked ?? false;
        const compactStats = dialog.querySelector<HTMLInputElement>('#inp-compact-stats')?.checked ?? false;

        const styleUpdates: Partial<DrawingStyle> = {
          accountSize: accSize,
          accountCurrency: accCurrency,
          riskMode,
          riskPercent: riskMode === 'PERCENT' ? riskVal : undefined,
          riskAmount: riskMode === 'CASH' ? riskVal : undefined,
          leverage: leverageVal,
          targetColor,
          stopColor,
          color: entryColor,
          width: lineWidth,
          targetOpacity,
          stopOpacity,
          showPrices,
          alwaysShowStats,
          compactStats,
        };

        this.updateStyle(styleUpdates);
        this.engine.redraw();
        overlay.remove();
      });
    } else {
      // Non-position drawing settings modal
      dialog.innerHTML = `
        <div class="tv-modal-header">
          <div class="tv-modal-title">
            <span class="pos-badge">${d.type.replace(/_/g, ' ').toUpperCase()} SETTINGS</span>
            <span class="pos-sym-subtitle">${d.symbol} · ${d.timeframe}</span>
          </div>
          <button class="tv-modal-close" id="pos-modal-close">✕</button>
        </div>

        <div class="tv-modal-body">
          <div class="pos-input-grid">
            <div class="pos-field-group">
              <label>Line / Border Color:</label>
              <input type="color" id="inp-entry-color" value="${d.style.color || '#2962ff'}">
            </div>
            <div class="pos-field-group">
              <label>Line Width:</label>
              <select id="inp-line-width">
                <option value="1" ${d.style.width === 1 ? 'selected' : ''}>1px</option>
                <option value="2" ${d.style.width === 2 ? 'selected' : ''}>2px</option>
                <option value="3" ${d.style.width === 3 ? 'selected' : ''}>3px</option>
                <option value="4" ${d.style.width === 4 ? 'selected' : ''}>4px</option>
              </select>
            </div>
          </div>
        </div>

        <div class="tv-modal-footer">
          <div class="tv-modal-footer-right">
            <button class="tv-modal-btn cancel" id="pos-modal-cancel">Cancel</button>
            <button class="tv-modal-btn save" id="pos-modal-save">Save Settings</button>
          </div>
        </div>
      `;

      dialog.querySelector('#pos-modal-close')?.addEventListener('click', () => overlay.remove());
      dialog.querySelector('#pos-modal-cancel')?.addEventListener('click', () => overlay.remove());
      dialog.querySelector('#pos-modal-save')?.addEventListener('click', () => {
        const entryColor = dialog.querySelector<HTMLInputElement>('#inp-entry-color')?.value || d.style.color || '#2962ff';
        const lineWidth = parseInt(dialog.querySelector<HTMLSelectElement>('#inp-line-width')?.value || '2', 10);
        this.updateStyle({
          color: entryColor,
          width: lineWidth,
        });
        this.engine.redraw();
        overlay.remove();
      });
    }

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  private addSep(): void {
    const sep = document.createElement('div');
    sep.className = 'style-editor-sep';
    this.el.appendChild(sep);
  }
}
