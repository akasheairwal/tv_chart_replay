/**
 * Unified Drawing Tool Settings Modal Dialog (ADR 0006)
 *
 * Provides a polymorphic, schema-driven settings modal supporting all 92 drawing tools,
 * featuring dynamic tabbed navigation ([Inputs], [Style], [Text], [Coordinates], [Visibility]),
 * live reactive previewing, transactional rollback on Cancel/Escape, atomic commit on Save/OK,
 * and persistent template presets.
 */

import type { DrawingEngine } from '../drawings/drawing-engine';
import {
  type DrawingDefinition,
  createDefaultTextOptions,
} from '../drawings/drawing-types';
import {
  getToolSettingsSchema,
  type ToolSettingsSchema,
  type SettingsTabId,
  type FieldDefinition,
} from '../drawings/drawing-settings-schema';
import {
  ColorOpacityPicker,
  LevelsMatrixTable,
  CoordinatesPointEditor,
  TimeframeVisibilityMatrix,
  TypographyEditor,
  TemplateMenu,
  sanitizeHexColor,
} from './drawing-settings-widgets';
import { calculatePositionMetrics, calculateFinancialPosition } from '../drawings/drawing-math';

export class DrawingSettingsModal {
  private overlayEl: HTMLElement | null = null;
  private dialogEl: HTMLElement | null = null;
  private snapshot: DrawingDefinition | null = null;
  private workingDraft: DrawingDefinition | null = null;
  private schema: ToolSettingsSchema | null = null;
  private activeTab: SettingsTabId = 'style';
  private onKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private static lastPosition: { x: number; y: number } | null = null;
  private static lastSize: { width: number; height: number } | null = null;

  public onCreateOrder?: (params: {
    side: 'BUY' | 'SELL';
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    lotSize: number;
  }) => void;

  public onSave?: (saved: DrawingDefinition) => void;
  public onCancel?: (snapshot: DrawingDefinition) => void;
  public onPreview?: (draft: DrawingDefinition) => void;

  constructor(private readonly engine: DrawingEngine) {}

  open(drawing: DrawingDefinition): void {
    this.close();

    // Clean up any stale orphaned overlays
    document
      .querySelectorAll('#drawing-settings-modal-overlay, #pos-settings-modal-overlay, .tv-settings-modal-overlay')
      .forEach((el) => el.remove());

    // 1. Capture immutable snapshot and create mutable working buffer
    this.snapshot = JSON.parse(JSON.stringify(drawing));
    this.workingDraft = JSON.parse(JSON.stringify(drawing));
    this.schema = getToolSettingsSchema(drawing.type);

    // Set initial active tab
    if (this.schema.tabs.includes(this.schema.defaultTab)) {
      this.activeTab = this.schema.defaultTab;
    } else {
      this.activeTab = this.schema.tabs[0] || 'style';
    }

    this.render();
  }

  close(): void {
    if (this.onKeyDownHandler) {
      window.removeEventListener('keydown', this.onKeyDownHandler);
      this.onKeyDownHandler = null;
    }
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
      this.dialogEl = null;
    }
    this.snapshot = null;
    this.workingDraft = null;
    this.schema = null;
  }

  cancel(): void {
    if (this.snapshot) {
      if (this.snapshot.id.startsWith('preset_')) {
        this.engine.updateToolDefaultStyle(this.snapshot.type, this.snapshot.style);
      } else {
        this.engine.restoreDrawing(this.snapshot);
      }
      if (this.onCancel) {
        this.onCancel(this.snapshot);
      }
    }
    this.close();
  }

  save(): void {
    if (this.workingDraft) {
      // Sync all position DOM fields if present in DOM
      const accSizeInp = this.overlayEl?.querySelector<HTMLInputElement>('#inp-acc-size');
      if (accSizeInp) {
        const v = parseFloat(accSizeInp.value);
        if (!isNaN(v)) this.workingDraft.style.accountSize = v;
      }
      const accCurrencyInp = this.overlayEl?.querySelector<HTMLInputElement>('#inp-acc-currency');
      if (accCurrencyInp) {
        this.workingDraft.style.accountCurrency = accCurrencyInp.value;
      }
      const riskModeSel = this.overlayEl?.querySelector<HTMLSelectElement>('#inp-risk-mode');
      const riskValInp = this.overlayEl?.querySelector<HTMLInputElement>('#inp-risk-val');
      if (riskModeSel && riskValInp) {
        const mode = riskModeSel.value as 'PERCENT' | 'CASH';
        const val = parseFloat(riskValInp.value);
        this.workingDraft.style.riskMode = mode;
        if (!isNaN(val)) {
          if (mode === 'PERCENT') {
            this.workingDraft.style.riskPercent = val;
            delete this.workingDraft.style.riskAmount;
          } else {
            this.workingDraft.style.riskAmount = val;
            delete this.workingDraft.style.riskPercent;
          }
        }
      }
      const leverageSel = this.overlayEl?.querySelector<HTMLSelectElement>('#inp-leverage');
      if (leverageSel) {
        const v = parseFloat(leverageSel.value);
        if (!isNaN(v)) this.workingDraft.style.leverage = v;
      }
      const entryInp = this.overlayEl?.querySelector<HTMLInputElement>('#inp-entry-price');
      if (entryInp) {
        const v = parseFloat(entryInp.value);
        if (!isNaN(v)) {
          this.workingDraft.style.entryPrice = v;
          if (this.workingDraft.points[0]) this.workingDraft.points[0].price = v;
        }
      }
      const tpInp = this.overlayEl?.querySelector<HTMLInputElement>('#inp-tp-price');
      if (tpInp) {
        const v = parseFloat(tpInp.value);
        if (!isNaN(v)) {
          this.workingDraft.style.targetPrice = v;
          if (this.workingDraft.points[1]) this.workingDraft.points[1].price = v;
        }
      }
      const slInp = this.overlayEl?.querySelector<HTMLInputElement>('#inp-sl-price');
      if (slInp) {
        const v = parseFloat(slInp.value);
        if (!isNaN(v)) {
          this.workingDraft.style.stopPrice = v;
          if (this.workingDraft.points[2]) this.workingDraft.points[2].price = v;
        }
      }

      // Sync legacy/direct DOM fields for position tools if modified directly
      const targetOpacityInp = this.overlayEl?.querySelector<HTMLInputElement>('#inp-target-opacity');
      if (targetOpacityInp) {
        const v = parseFloat(targetOpacityInp.value);
        if (!isNaN(v)) {
          this.workingDraft.style.targetOpacity = v > 1 ? v / 100 : v;
        }
      }
      const stopOpacityInp = this.overlayEl?.querySelector<HTMLInputElement>('#inp-stop-opacity');
      if (stopOpacityInp) {
        const v = parseFloat(stopOpacityInp.value);
        if (!isNaN(v)) {
          this.workingDraft.style.stopOpacity = v > 1 ? v / 100 : v;
        }
      }
      const showPricesInp = this.overlayEl?.querySelector<HTMLInputElement>('#inp-show-prices');
      if (showPricesInp) {
        this.workingDraft.style.showPrices = showPricesInp.checked;
        this.workingDraft.style.showPriceLabels = showPricesInp.checked;
      }

      if (this.workingDraft.id.startsWith('preset_')) {
        this.engine.updateToolDefaultStyle(this.workingDraft.type, this.workingDraft.style);
      } else {
        if (this.engine.commitDrawing) {
          this.engine.commitDrawing(this.workingDraft);
        }
        if ((this.engine as any).updateDrawingStyle) {
          (this.engine as any).updateDrawingStyle(this.workingDraft.id, { ...this.workingDraft.style });
        }
        if ((this.engine as any).redraw) {
          (this.engine as any).redraw();
        }
      }

      if (this.onSave) {
        this.onSave(this.workingDraft);
      }
    }
    this.close();
  }

  private preview(): void {
    if (this.workingDraft) {
      if (this.workingDraft.id.startsWith('preset_')) {
        this.engine.updateToolDefaultStyle(this.workingDraft.type, this.workingDraft.style);
      } else {
        this.engine.previewDrawing(this.workingDraft);
      }
      if (this.onPreview) {
        this.onPreview(this.workingDraft);
      }
    }
  }

  private render(): void {
    if (!this.workingDraft || !this.schema) return;

    const isPosition =
      this.workingDraft.type === 'long_position' || this.workingDraft.type === 'short_position';
    const isLong = this.workingDraft.type === 'long_position';

    this.overlayEl = document.createElement('div');
    this.overlayEl.id = isPosition ? 'pos-settings-modal-overlay' : 'drawing-settings-modal-overlay';
    this.overlayEl.className = 'modal-overlay tv-modal-overlay tv-settings-modal-overlay';
    this.overlayEl.style.display = 'flex';
    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) {
        this.cancel();
      }
    });

    this.dialogEl = document.createElement('div');
    this.dialogEl.className = 'modal-dialog tv-modal tv-modal-container tv-settings-dialog pos-settings-dialog';

    // Position and Sizing: floating, draggable and resizable
    const initialWidth = DrawingSettingsModal.lastSize?.width ?? (isPosition ? 460 : 520);
    const initialHeight = DrawingSettingsModal.lastSize?.height ?? 540;
    this.dialogEl.style.width = `${initialWidth}px`;
    if (DrawingSettingsModal.lastSize?.height) {
      this.dialogEl.style.height = `${initialHeight}px`;
    }

    const winW = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1024;
    const winH = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 768;

    if (DrawingSettingsModal.lastPosition) {
      const maxX = Math.max(10, winW - 100);
      const maxY = Math.max(10, winH - 80);
      const posX = Math.max(10, Math.min(maxX, DrawingSettingsModal.lastPosition.x));
      const posY = Math.max(10, Math.min(maxY, DrawingSettingsModal.lastPosition.y));
      this.dialogEl.style.left = `${posX}px`;
      this.dialogEl.style.top = `${posY}px`;
    } else {
      const left = Math.max(20, Math.round((winW - initialWidth) / 2));
      const top = Math.max(20, Math.round((winH - initialHeight) / 2));
      this.dialogEl.style.left = `${left}px`;
      this.dialogEl.style.top = `${top}px`;
    }

    // 1. Header (acts as draggable handle)
    const header = document.createElement('div');
    header.className = 'modal-header tv-modal-header';
    header.style.cursor = 'grab';

    header.addEventListener('pointerdown', (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('.modal-close-btn') ||
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'BUTTON'
      ) {
        return;
      }
      e.preventDefault();

      const rect = this.dialogEl!.getBoundingClientRect();
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startDialogX = parseFloat(this.dialogEl!.style.left) || rect.left;
      const startDialogY = parseFloat(this.dialogEl!.style.top) || rect.top;

      header.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      const onPointerMove = (moveEvt: PointerEvent) => {
        const dx = moveEvt.clientX - startMouseX;
        const dy = moveEvt.clientY - startMouseY;
        let newX = startDialogX + dx;
        let newY = startDialogY + dy;

        const currentWinW = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1024;
        const currentWinH = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 768;
        const maxX = Math.max(10, currentWinW - 80);
        const maxY = Math.max(10, currentWinH - 50);
        newX = Math.max(0, Math.min(maxX, newX));
        newY = Math.max(0, Math.min(maxY, newY));

        if (this.dialogEl) {
          this.dialogEl.style.left = `${newX}px`;
          this.dialogEl.style.top = `${newY}px`;
          DrawingSettingsModal.lastPosition = { x: newX, y: newY };
        }
      };

      const onPointerUp = () => {
        header.style.cursor = 'grab';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    });

    const titleWrap = document.createElement('div');
    titleWrap.className = 'modal-title tv-modal-title';

    const badge = document.createElement('span');
    badge.className = `pos-badge ${isPosition ? (isLong ? 'long' : 'short') : ''}`;
    badge.textContent = isPosition
      ? `${isLong ? '🟢 LONG' : '🔴 SHORT'} POSITION SETTINGS`
      : `${this.schema.title.toUpperCase()} SETTINGS`;
    titleWrap.appendChild(badge);

    const sub = document.createElement('span');
    sub.className = 'pos-sym-subtitle';
    const symText = this.workingDraft.symbol || '';
    const tfText = this.workingDraft.timeframe || '';
    sub.textContent = symText && tfText ? `${symText} · ${tfText}` : symText || tfText || '';
    titleWrap.appendChild(sub);

    header.appendChild(titleWrap);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-btn tv-modal-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancel();
    });
    header.appendChild(closeBtn);

    this.dialogEl.appendChild(header);

    // 2. Tab Navigation
    const tabsBar = document.createElement('div');
    tabsBar.className = 'tv-modal-tabs';

    const tabLabels: Record<SettingsTabId, string> = {
      inputs: 'Inputs',
      style: 'Style',
      text: 'Text',
      coordinates: 'Coordinates',
      visibility: 'Visibility',
    };

    for (const tabId of this.schema.tabs) {
      const tabBtn = document.createElement('button');
      tabBtn.id = `tab-btn-${tabId}`;
      tabBtn.type = 'button';
      tabBtn.className = `tv-modal-tab ${this.activeTab === tabId ? 'active' : ''}`;
      tabBtn.textContent = tabLabels[tabId];
      tabBtn.addEventListener('click', () => {
        this.activeTab = tabId;
        this.updateActiveTab(tabsBar);
      });
      tabsBar.appendChild(tabBtn);
    }
    this.dialogEl.appendChild(tabsBar);

    // 3. Tab Body Container
    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'modal-body tv-modal-body tv-settings-modal-body';
    for (const tabId of this.schema.tabs) {
      const panel = document.createElement('div');
      panel.id = `panel-${tabId}`;
      panel.className = `tv-modal-tab-panel tv-panel-${tabId}`;
      panel.style.display = this.activeTab === tabId ? 'block' : 'none';
      this.renderTabPanelContent(tabId, panel);
      bodyContainer.appendChild(panel);
    }
    this.dialogEl.appendChild(bodyContainer);

    // 4. Footer Bar
    const footer = document.createElement('div');
    footer.className = 'tv-modal-footer';

    // Left: Template Preset Menu
    const tplMenu = new TemplateMenu(
      this.workingDraft.type,
      () => this.workingDraft?.style || {},
      (appliedStyle) => {
        if (!this.workingDraft) return;
        this.workingDraft.style = { ...this.workingDraft.style, ...appliedStyle };
        this.preview();
        const activePanel = this.dialogEl?.querySelector<HTMLElement>(`#panel-${this.activeTab}`);
        if (activePanel) {
          activePanel.innerHTML = '';
          this.renderTabPanelContent(this.activeTab, activePanel);
        }
      },
      () => this.engine.getToolDefaultStyle(this.workingDraft!.type)
    );
    footer.appendChild(tplMenu.el);

    // Middle/Left: Create Order Action for Position Tools
    if (isPosition && this.onCreateOrder) {
      const tradeBtn = document.createElement('button');
      tradeBtn.type = 'button';
      tradeBtn.className = 'tv-modal-btn trade';
      tradeBtn.textContent = '⚡ Create Order';
      tradeBtn.addEventListener('click', () => {
        this.executeTrade();
      });
      footer.appendChild(tradeBtn);
    }

    // Right: Cancel & Save Buttons
    const rightActions = document.createElement('div');
    rightActions.className = 'tv-modal-footer-right';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'tv-modal-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.cancel());
    rightActions.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.id = 'pos-modal-save';
    saveBtn.type = 'button';
    saveBtn.className = 'tv-modal-btn save';
    saveBtn.textContent = 'Save Settings';
    saveBtn.addEventListener('click', () => this.save());
    rightActions.appendChild(saveBtn);

    footer.appendChild(rightActions);
    this.dialogEl.appendChild(footer);

    // 5. Corner Resizer Grip
    const resizer = document.createElement('div');
    resizer.className = 'tv-dialog-resizer';
    resizer.title = 'Drag to resize dialog';
    resizer.innerHTML = `
      <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor">
        <circle cx="8" cy="2" r="1.2" />
        <circle cx="8" cy="5.5" r="1.2" />
        <circle cx="8" cy="9" r="1.2" />
        <circle cx="4.5" cy="5.5" r="1.2" />
        <circle cx="4.5" cy="9" r="1.2" />
        <circle cx="1" cy="9" r="1.2" />
      </svg>
    `;

    resizer.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = this.dialogEl!.getBoundingClientRect();
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startWidth = parseFloat(this.dialogEl!.style.width) || rect.width || 520;
      const startHeight = parseFloat(this.dialogEl!.style.height) || rect.height || 540;

      document.body.style.userSelect = 'none';

      const onResizeMove = (moveEvt: PointerEvent) => {
        const dw = moveEvt.clientX - startMouseX;
        const dh = moveEvt.clientY - startMouseY;
        const currentLeft = parseFloat(this.dialogEl!.style.left) || 0;
        const currentTop = parseFloat(this.dialogEl!.style.top) || 0;
        const currentWinW = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1024;
        const currentWinH = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 768;
        const maxW = Math.max(380, currentWinW - currentLeft - 10);
        const maxH = Math.max(280, currentWinH - currentTop - 10);
        const newWidth = Math.max(380, Math.min(maxW, startWidth + dw));
        const newHeight = Math.max(280, Math.min(maxH, startHeight + dh));

        if (this.dialogEl) {
          this.dialogEl.style.width = `${newWidth}px`;
          this.dialogEl.style.height = `${newHeight}px`;
          DrawingSettingsModal.lastSize = { width: newWidth, height: newHeight };
        }
      };

      const onResizeUp = () => {
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onResizeMove);
        window.removeEventListener('pointerup', onResizeUp);
        window.removeEventListener('pointercancel', onResizeUp);
      };

      window.addEventListener('pointermove', onResizeMove);
      window.addEventListener('pointerup', onResizeUp);
      window.addEventListener('pointercancel', onResizeUp);
    });

    this.dialogEl.appendChild(resizer);

    // Track native resize via CSS resize: both
    this.dialogEl.addEventListener('pointerup', () => {
      if (this.dialogEl) {
        const rect = this.dialogEl.getBoundingClientRect();
        if (rect.width && rect.height) {
          DrawingSettingsModal.lastSize = { width: rect.width, height: rect.height };
        }
      }
    });

    this.overlayEl.appendChild(this.dialogEl);
    document.body.appendChild(this.overlayEl);

    // Global Keydown Listeners (Escape to Cancel, Enter to Save)
    this.onKeyDownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancel();
      } else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this.save();
      }
    };
    window.addEventListener('keydown', this.onKeyDownHandler);
  }

  private updateActiveTab(tabsBar: HTMLElement): void {
    if (!this.schema) return;
    const tabButtons = tabsBar.querySelectorAll<HTMLButtonElement>('.tv-modal-tab');
    this.schema.tabs.forEach((tabId, idx) => {
      const btn = tabButtons[idx];
      if (btn) btn.classList.toggle('active', this.activeTab === tabId);
    });

    const panels = this.dialogEl?.querySelectorAll<HTMLElement>('.tv-modal-tab-panel');
    panels?.forEach((panel) => {
      if (panel.id === `panel-${this.activeTab}`) {
        panel.innerHTML = '';
        this.renderTabPanelContent(this.activeTab, panel);
        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    });
  }

  private renderTabPanelContent(tabId: SettingsTabId, container: HTMLElement): void {
    if (!this.workingDraft || !this.schema) return;

    switch (tabId) {
      case 'inputs':
        this.renderInputsTab(container);
        break;
      case 'style':
        this.renderStyleTab(container);
        break;
      case 'text':
        this.renderTextTab(container);
        break;
      case 'coordinates':
        this.renderCoordinatesTab(container);
        break;
      case 'visibility':
        this.renderVisibilityTab(container);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Tab 1: Inputs Tab
  // -------------------------------------------------------------------------
  private renderInputsTab(container: HTMLElement): void {
    if (!this.workingDraft) return;

    const isPosition =
      this.workingDraft.type === 'long_position' || this.workingDraft.type === 'short_position';

    if (isPosition) {
      this.renderPositionInputs(container);
      return;
    }

    // Generic Schema Inputs (e.g. regression channel, anchored vwap)
    if (this.schema?.inputsSections) {
      for (const sec of this.schema.inputsSections) {
        const secWrap = document.createElement('div');
        secWrap.className = 'tv-settings-section';

        if (sec.title) {
          const secTitle = document.createElement('div');
          secTitle.className = 'tv-section-title';
          secTitle.textContent = sec.title;
          secWrap.appendChild(secTitle);
        }

        const grid = document.createElement('div');
        grid.className = 'pos-input-grid';

        for (const field of sec.fields) {
          grid.appendChild(this.renderFieldWidget(field));
        }

        secWrap.appendChild(grid);
        container.appendChild(secWrap);
      }
    }
  }

  private renderPositionInputs(container: HTMLElement): void {
    const d = this.workingDraft!;
    const metrics = calculatePositionMetrics(d.type as any, d.points, d.style);

    const inputGrid = document.createElement('div');
    inputGrid.className = 'pos-input-grid';

    // Account Size
    inputGrid.appendChild(
      this.createFormField('Account Size ($):', 'number', 'inp-acc-size', d.style.accountSize || 10000, 500, 100)
    );

    // Account Currency
    inputGrid.appendChild(
      this.createFormField('Account Currency:', 'text', 'inp-acc-currency', d.style.accountCurrency || 'USD')
    );

    // Risk Mode Select
    const modeGroup = document.createElement('div');
    modeGroup.className = 'pos-field-group';
    const modeLabel = document.createElement('label');
    modeLabel.textContent = 'Risk Mode:';
    const modeSelect = document.createElement('select');
    modeSelect.id = 'inp-risk-mode';
    modeSelect.innerHTML = `
      <option value="PERCENT" ${(d.style.riskMode || 'PERCENT') === 'PERCENT' ? 'selected' : ''}>% of Account</option>
      <option value="CASH" ${d.style.riskMode === 'CASH' ? 'selected' : ''}>$ Cash Amount</option>
    `;
    modeGroup.appendChild(modeLabel);
    modeGroup.appendChild(modeSelect);
    inputGrid.appendChild(modeGroup);

    // Risk Value
    const isCash = d.style.riskMode === 'CASH';
    const riskGroup = document.createElement('div');
    riskGroup.className = 'pos-field-group';
    const riskLabel = document.createElement('label');
    riskLabel.id = 'inp-risk-val-label';
    riskLabel.textContent = isCash ? 'Risk Amount ($):' : 'Risk Percentage (%):';
    const riskInput = document.createElement('input');
    riskInput.type = 'number';
    riskInput.id = 'inp-risk-val';
    riskInput.step = '0.1';
    riskInput.min = '0.01';
    riskInput.value = String(isCash ? d.style.riskAmount || 100 : d.style.riskPercent || 1.0);
    riskGroup.appendChild(riskLabel);
    riskGroup.appendChild(riskInput);
    inputGrid.appendChild(riskGroup);

    // Entry Price
    inputGrid.appendChild(
      this.createFormField('Entry Price:', 'number', 'inp-entry-price', d.points[0]?.price ?? 0, 0.0001)
    );

    // Leverage
    const levGroup = document.createElement('div');
    levGroup.className = 'pos-field-group';
    const levLabel = document.createElement('label');
    levLabel.textContent = 'Account Leverage:';
    const levSelect = document.createElement('select');
    levSelect.id = 'inp-leverage';
    levSelect.innerHTML = [1, 2, 5, 10, 20, 30, 50, 100]
      .map(
        (lev) =>
          `<option value="${lev}" ${(d.style.leverage ?? 1) === lev ? 'selected' : ''}>${lev}x</option>`
      )
      .join('');
    levGroup.appendChild(levLabel);
    levGroup.appendChild(levSelect);
    inputGrid.appendChild(levGroup);

    // Profit Target Level
    inputGrid.appendChild(
      this.createFormField('Profit Target Level:', 'number', 'inp-tp-price', metrics.tpPrice, 0.0001)
    );

    // Stop Loss Level
    inputGrid.appendChild(
      this.createFormField('Stop Loss Level:', 'number', 'inp-sl-price', metrics.slPrice, 0.0001)
    );

    container.appendChild(inputGrid);

    // Position Summary Card
    const card = document.createElement('div');
    card.className = 'pos-summary-card';
    card.innerHTML = `
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
    `;
    container.appendChild(card);

    // Live calculation listeners
    const updateCalculations = () => {
      const accSize = parseFloat(container.querySelector<HTMLInputElement>('#inp-acc-size')?.value || '10000');
      const accCurrency = container.querySelector<HTMLInputElement>('#inp-acc-currency')?.value || 'USD';
      const riskMode = (container.querySelector<HTMLSelectElement>('#inp-risk-mode')?.value || 'PERCENT') as 'PERCENT' | 'CASH';
      const riskVal = parseFloat(container.querySelector<HTMLInputElement>('#inp-risk-val')?.value || '1.0');
      const entryPx = parseFloat(container.querySelector<HTMLInputElement>('#inp-entry-price')?.value || String(d.points[0]?.price ?? 0));
      const tpPx = parseFloat(container.querySelector<HTMLInputElement>('#inp-tp-price')?.value || String(metrics.tpPrice));
      const slPx = parseFloat(container.querySelector<HTMLInputElement>('#inp-sl-price')?.value || String(metrics.slPrice));
      const leverageVal = parseFloat(container.querySelector<HTMLSelectElement>('#inp-leverage')?.value || '1');

      // Update workingDraft
      d.style.accountSize = accSize;
      d.style.accountCurrency = accCurrency;
      d.style.riskMode = riskMode;
      if (riskMode === 'PERCENT') {
        d.style.riskPercent = riskVal;
        delete d.style.riskAmount;
      } else {
        d.style.riskAmount = riskVal;
        delete d.style.riskPercent;
      }
      d.style.leverage = leverageVal;
      d.style.entryPrice = entryPx;
      d.style.targetPrice = tpPx;
      d.style.stopPrice = slPx;

      if (!d.points[0]) d.points[0] = { timestamp: Math.floor(Date.now() / 1000), price: entryPx };
      else d.points[0].price = entryPx;
      if (!d.points[1]) d.points[1] = { timestamp: d.points[0].timestamp, price: tpPx };
      else d.points[1].price = tpPx;
      if (!d.points[2]) d.points[2] = { timestamp: d.points[0].timestamp, price: slPx };
      else d.points[2].price = slPx;

      const live = calculateFinancialPosition({
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

      const cLots = container.querySelector('#card-lots');
      const cRr = container.querySelector('#card-rr');
      const cRisk = container.querySelector('#card-risk');
      const cProfit = container.querySelector('#card-profit');
      const cMargin = container.querySelector<HTMLElement>('#card-margin-row');

      if (cLots) cLots.textContent = `${live.lotSize.toFixed(2)} Lots`;
      if (cRr) cRr.textContent = `1 : ${live.rrRatio}`;
      if (cRisk) cRisk.textContent = `-$${live.lossDollar.toFixed(2)} (-${live.slPips.toFixed(1)} pips)`;
      if (cProfit) cProfit.textContent = `+$${live.profitDollar.toFixed(2)} (+${live.tpPips.toFixed(1)} pips)`;
      if (cMargin) cMargin.style.display = live.isMarginExceeded ? 'flex' : 'none';

      this.preview();
    };

    modeSelect.addEventListener('change', () => {
      riskLabel.textContent = modeSelect.value === 'CASH' ? 'Risk Amount ($):' : 'Risk Percentage (%):';
      updateCalculations();
    });

    for (const selector of [
      '#inp-acc-size',
      '#inp-acc-currency',
      '#inp-risk-val',
      '#inp-entry-price',
      '#inp-tp-price',
      '#inp-sl-price',
      '#inp-leverage',
    ]) {
      const el = container.querySelector(selector);
      el?.addEventListener('input', updateCalculations);
      el?.addEventListener('change', updateCalculations);
    }
  }

  // -------------------------------------------------------------------------
  // Tab 2: Style Tab
  // -------------------------------------------------------------------------
  private renderStyleTab(container: HTMLElement): void {
    if (!this.workingDraft || !this.schema?.styleSections) return;

    for (const sec of this.schema.styleSections) {
      const secWrap = document.createElement('div');
      secWrap.className = 'tv-settings-section';

      if (sec.title) {
        const secTitle = document.createElement('div');
        secTitle.className = 'tv-section-title';
        secTitle.textContent = sec.title;
        secWrap.appendChild(secTitle);
      }

      for (const field of sec.fields) {
        secWrap.appendChild(this.renderFieldWidget(field));
      }

      container.appendChild(secWrap);
    }
  }

  // -------------------------------------------------------------------------
  // Tab 3: Text Tab
  // -------------------------------------------------------------------------
  private renderTextTab(container: HTMLElement): void {
    if (!this.workingDraft) return;

    const currentTextOpts = {
      ...createDefaultTextOptions(this.workingDraft.style.text),
      ...(this.workingDraft.style.textOptions || {}),
    };
    if (!currentTextOpts.content && this.workingDraft.style.text) {
      currentTextOpts.content = this.workingDraft.style.text;
    }

    const editor = new TypographyEditor(currentTextOpts, (opts) => {
      if (!this.workingDraft) return;
      this.workingDraft.style.textOptions = { ...opts };
      this.workingDraft.style.text = opts.content;
      this.preview();
    });

    container.appendChild(editor.el);
  }

  // -------------------------------------------------------------------------
  // Tab 4: Coordinates Tab
  // -------------------------------------------------------------------------
  private renderCoordinatesTab(container: HTMLElement): void {
    if (!this.workingDraft) return;

    const editor = new CoordinatesPointEditor(this.workingDraft.points, (pts) => {
      if (!this.workingDraft) return;
      this.workingDraft.points = pts;
      this.preview();
    });

    container.appendChild(editor.el);
  }

  // -------------------------------------------------------------------------
  // Tab 5: Visibility Tab
  // -------------------------------------------------------------------------
  private renderVisibilityTab(container: HTMLElement): void {
    if (!this.workingDraft) return;

    const editor = new TimeframeVisibilityMatrix(this.workingDraft.visibility, (filter) => {
      if (!this.workingDraft) return;
      this.workingDraft.visibility = filter;
      this.preview();
    });

    container.appendChild(editor.el);
  }

  // -------------------------------------------------------------------------
  // Field Widget Dispatcher
  // -------------------------------------------------------------------------
  private renderFieldWidget(field: FieldDefinition): HTMLElement {
    const d = this.workingDraft!;
    const row = document.createElement('div');
    row.className = 'tv-settings-row';

    switch (field.widget) {
      case 'color_opacity': {
        const val = field.getter(d.style, d.points, d);
        let sliderId: string | undefined = undefined;
        if (field.id === 'target_zone_color') sliderId = 'inp-target-opacity';
        if (field.id === 'stop_zone_color') sliderId = 'inp-stop-opacity';

        const picker = new ColorOpacityPicker(
          val.color,
          val.opacity,
          (c, o) => {
            field.setter({ color: c, opacity: o }, d.style, d.points, d);
            this.preview();
          },
          sliderId
        );
        const label = document.createElement('div');
        label.className = 'tv-field-label';
        label.textContent = field.label;
        row.appendChild(label);
        row.appendChild(picker.el);
        return row;
      }

      case 'line_width': {
        const val = field.getter(d.style, d.points, d);
        const label = document.createElement('div');
        label.className = 'tv-field-label';
        label.textContent = field.label;
        row.appendChild(label);

        const group = document.createElement('div');
        group.className = 'tv-pill-group';
        for (const w of [1, 2, 3, 4]) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `tv-pill-btn ${val === w ? 'active' : ''}`;
          btn.textContent = `${w}px`;
          btn.addEventListener('click', () => {
            field.setter(w, d.style, d.points, d);
            group.querySelectorAll('.tv-pill-btn').forEach((b, i) => b.classList.toggle('active', i + 1 === w));
            this.preview();
          });
          group.appendChild(btn);
        }
        row.appendChild(group);
        return row;
      }

      case 'line_style': {
        const val = field.getter(d.style, d.points, d);
        const label = document.createElement('div');
        label.className = 'tv-field-label';
        label.textContent = field.label;
        row.appendChild(label);

        const group = document.createElement('div');
        group.className = 'tv-pill-group';
        const styles = [
          { id: 'solid', label: '—' },
          { id: 'dashed', label: '---' },
          { id: 'dotted', label: '···' },
        ];
        for (const s of styles) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `tv-pill-btn ${val === s.id ? 'active' : ''}`;
          btn.textContent = s.label;
          btn.addEventListener('click', () => {
            field.setter(s.id, d.style, d.points, d);
            group.querySelectorAll('.tv-pill-btn').forEach((b) => b.classList.toggle('active', b.textContent === s.label));
            this.preview();
          });
          group.appendChild(btn);
        }
        row.appendChild(group);
        return row;
      }

      case 'checkbox': {
        const val = field.getter(d.style, d.points, d);
        const lbl = document.createElement('label');
        lbl.className = 'tv-checkbox-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = val === true;
        if (field.id === 'show_prices' || field.id === 'price_labels') {
          cb.id = 'inp-show-prices';
        }
        cb.addEventListener('change', () => {
          field.setter(cb.checked, d.style, d.points, d);
          this.preview();
        });
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(` ${field.label}`));
        row.appendChild(lbl);
        return row;
      }

      case 'number_stepper': {
        const val = field.getter(d.style, d.points, d);
        const label = document.createElement('div');
        label.className = 'tv-field-label';
        label.textContent = field.label;
        row.appendChild(label);

        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'tv-number-stepper';
        inp.value = String(val ?? 0);
        if (field.props?.min !== undefined) inp.min = String(field.props.min);
        if (field.props?.max !== undefined) inp.max = String(field.props.max);
        if (field.props?.step !== undefined) inp.step = String(field.props.step);

        inp.addEventListener('input', () => {
          field.setter(parseFloat(inp.value) || 0, d.style, d.points, d);
          this.preview();
        });
        row.appendChild(inp);
        return row;
      }

      case 'color_picker': {
        const val = field.getter(d.style, d.points, d);
        const label = document.createElement('div');
        label.className = 'tv-field-label';
        label.textContent = field.label;
        row.appendChild(label);

        const group = document.createElement('div');
        group.className = 'tv-color-picker-wrap';
        const colorInp = document.createElement('input');
        colorInp.type = 'color';
        colorInp.className = 'tv-color-picker-input';
        colorInp.value = sanitizeHexColor(typeof val === 'string' ? val : val?.color || '#2962ff');
        colorInp.addEventListener('input', () => {
          field.setter(colorInp.value, d.style, d.points, d);
          this.preview();
        });
        group.appendChild(colorInp);
        row.appendChild(group);
        return row;
      }

      case 'select': {
        const val = field.getter(d.style, d.points, d);
        const label = document.createElement('div');
        label.className = 'tv-field-label';
        label.textContent = field.label;
        row.appendChild(label);

        const sel = document.createElement('select');
        sel.className = 'tv-select-field';
        for (const opt of field.props?.options || []) {
          const optEl = document.createElement('option');
          optEl.value = String(opt.value);
          optEl.textContent = opt.label;
          optEl.selected = String(val) === String(opt.value);
          sel.appendChild(optEl);
        }
        sel.value = String(val);
        sel.addEventListener('change', () => {
          const matchedOpt = field.props?.options?.find((o) => String(o.value) === sel.value);
          const finalVal =
            matchedOpt !== undefined
              ? matchedOpt.value
              : typeof val === 'number'
                ? parseFloat(sel.value)
                : sel.value;
          field.setter(finalVal, d.style, d.points, d);
          this.preview();
        });
        row.appendChild(sel);
        return row;
      }

      case 'text_input': {
        const val = field.getter(d.style, d.points, d);
        const label = document.createElement('div');
        label.className = 'tv-field-label';
        label.textContent = field.label;
        row.appendChild(label);

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'tv-text-field';
        inp.value = String(val ?? '');
        if (field.props?.placeholder) inp.placeholder = field.props.placeholder;
        const handleText = () => {
          field.setter(inp.value, d.style, d.points, d);
          this.preview();
        };
        inp.addEventListener('input', handleText);
        inp.addEventListener('change', handleText);
        row.appendChild(inp);
        return row;
      }

      case 'textarea': {
        const val = field.getter(d.style, d.points, d);
        const label = document.createElement('div');
        label.className = 'tv-field-label';
        label.textContent = field.label;
        row.appendChild(label);

        const area = document.createElement('textarea');
        area.className = 'tv-settings-textarea';
        area.value = String(val ?? '');
        if (field.props?.placeholder) area.placeholder = field.props.placeholder;
        area.addEventListener('input', () => {
          field.setter(area.value, d.style, d.points, d);
          this.preview();
        });
        row.appendChild(area);
        return row;
      }

      case 'font_styling': {
        const val = field.getter(d.style, d.points, d);
        const label = document.createElement('div');
        label.className = 'tv-field-label';
        label.textContent = field.label;
        row.appendChild(label);

        const fontWrap = document.createElement('div');
        fontWrap.className = 'tv-font-controls-row';

        const sizeSel = document.createElement('select');
        sizeSel.className = 'tv-font-size-select';
        for (const sz of [10, 12, 14, 16, 20, 24, 28, 32, 40]) {
          const opt = document.createElement('option');
          opt.value = String(sz);
          opt.textContent = `${sz}px`;
          opt.selected = (val?.fontSize ?? 14) === sz;
          sizeSel.appendChild(opt);
        }
        sizeSel.value = String(val?.fontSize ?? 14);

        const boldBtn = document.createElement('button');
        boldBtn.type = 'button';
        boldBtn.className = `tv-pill-btn bold ${val?.fontBold ? 'active' : ''}`;
        boldBtn.textContent = 'B';

        const italicBtn = document.createElement('button');
        italicBtn.type = 'button';
        italicBtn.className = `tv-pill-btn italic ${val?.fontItalic ? 'active' : ''}`;
        italicBtn.textContent = 'I';

        const colorInp = document.createElement('input');
        colorInp.type = 'color';
        colorInp.className = 'tv-color-picker-input';
        colorInp.value = sanitizeHexColor(val?.textColor || '#ffffff');

        const currentFontState = {
          fontSize: val?.fontSize ?? 14,
          fontBold: Boolean(val?.fontBold),
          fontItalic: Boolean(val?.fontItalic),
          textColor: val?.textColor || '#ffffff',
        };

        const emitFont = () => {
          field.setter({ ...currentFontState }, d.style, d.points, d);
          this.preview();
        };

        sizeSel.addEventListener('change', () => {
          currentFontState.fontSize = parseInt(sizeSel.value, 10);
          emitFont();
        });
        boldBtn.addEventListener('click', () => {
          currentFontState.fontBold = !currentFontState.fontBold;
          boldBtn.classList.toggle('active', currentFontState.fontBold);
          emitFont();
        });
        italicBtn.addEventListener('click', () => {
          currentFontState.fontItalic = !currentFontState.fontItalic;
          italicBtn.classList.toggle('active', currentFontState.fontItalic);
          emitFont();
        });
        colorInp.addEventListener('input', () => {
          currentFontState.textColor = colorInp.value;
          emitFont();
        });

        fontWrap.appendChild(sizeSel);
        fontWrap.appendChild(boldBtn);
        fontWrap.appendChild(italicBtn);
        fontWrap.appendChild(colorInp);
        row.appendChild(fontWrap);
        return row;
      }

      case 'levels_matrix': {
        const levels = field.getter(d.style, d.points, d);
        const matrix = new LevelsMatrixTable(
          levels,
          {
            useOneColor: d.style.useOneColor,
            fillBackground: d.style.fillBackground,
            backgroundOpacity: d.style.backgroundOpacity ?? d.style.fillOpacity,
            reverse: d.style.reverse,
          },
          (updatedLevels, opts) => {
            field.setter(updatedLevels, d.style, d.points, d);
            d.style.useOneColor = opts.useOneColor;
            d.style.fillBackground = opts.fillBackground;
            if (opts.backgroundOpacity !== undefined) {
              d.style.backgroundOpacity = opts.backgroundOpacity;
              d.style.fillOpacity = opts.backgroundOpacity;
            }
            d.style.reverse = opts.reverse;
            this.preview();
          }
        );
        row.appendChild(matrix.el);
        return row;
      }

      default: {
        const fallback = document.createElement('div');
        fallback.textContent = field.label;
        row.appendChild(fallback);
        return row;
      }
    }
  }

  private createFormField(
    label: string,
    type: string,
    id: string,
    value: string | number,
    step?: number,
    min?: number
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'pos-field-group';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.type = type;
    inp.id = id;
    inp.value = String(value);
    if (step !== undefined) inp.step = String(step);
    if (min !== undefined) inp.min = String(min);
    group.appendChild(lbl);
    group.appendChild(inp);
    return group;
  }

  private executeTrade(): void {
    if (!this.onCreateOrder || !this.workingDraft) return;
    const d = JSON.parse(JSON.stringify(this.workingDraft));
    this.save();
    const metrics = calculatePositionMetrics(d.type as any, d.points, d.style);
    this.onCreateOrder({
      side: metrics.isLong ? 'BUY' : 'SELL',
      entryPrice: metrics.entryPrice,
      slPrice: metrics.slPrice,
      tpPrice: metrics.tpPrice,
      lotSize: metrics.lotSize,
    });
  }
}
