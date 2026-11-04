import { getIcon } from './icons';
import type { ChartManager } from '../chart/chart-manager';

export interface ChartCornerSettingsOptions {
  chartContainer: HTMLElement;
  chartManager: ChartManager;
  onResetChartView: () => void;
  onOpenChartSettings?: () => void;
  onRemoveAllDrawings?: () => void;
}

export class ChartCornerSettingsPopup {
  private cornerAreaEl: HTMLDivElement | null = null;
  private buttonEl: HTMLButtonElement | null = null;
  private popupEl: HTMLElement | null = null;
  private isOpen = false;
  private readonly onGlobalPointerDownBound: (e: PointerEvent) => void;
  private readonly onGlobalKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onWindowResizeBound: () => void;

  constructor(private readonly options: ChartCornerSettingsOptions) {
    this.onGlobalPointerDownBound = (e: PointerEvent) => this.handleGlobalPointerDown(e);
    this.onGlobalKeyDownBound = (e: KeyboardEvent) => this.handleGlobalKeyDown(e);
    this.onWindowResizeBound = () => this.updateDimensions();

    this.init();
  }

  private init(): void {
    // 1. Create corner area occupying the free space below price scale and right of time scale
    this.cornerAreaEl = document.createElement('div');
    this.cornerAreaEl.className = 'tv-chart-corner-area';

    // 2. Create settings button inside the corner free space
    this.buttonEl = document.createElement('button');
    this.buttonEl.className = 'tv-chart-corner-settings-btn';
    this.buttonEl.type = 'button';
    this.buttonEl.title = 'Chart Settings (Alt+R to Reset)';
    this.buttonEl.setAttribute('aria-label', 'Chart Settings');
    this.buttonEl.innerHTML = getIcon('settings');

    this.buttonEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    this.cornerAreaEl.appendChild(this.buttonEl);
    this.options.chartContainer.appendChild(this.cornerAreaEl);
    this.updateDimensions();

    // 3. Global event listeners for dismissal & resize sync
    window.addEventListener('pointerdown', this.onGlobalPointerDownBound, true);
    window.addEventListener('keydown', this.onGlobalKeyDownBound);
    window.addEventListener('resize', this.onWindowResizeBound);

    // Sync when chart price/time scale dimensions change
    this.options.chartManager.setOnDimensionsChange?.(() => this.updateDimensions());
  }

  public updateDimensions(): void {
    if (!this.cornerAreaEl) return;
    const w = this.options.chartManager.getPriceScaleWidth();
    const h = this.options.chartManager.getTimeScaleHeight();
    this.cornerAreaEl.style.width = `${w}px`;
    this.cornerAreaEl.style.height = `${h}px`;
  }

  private handleGlobalPointerDown(e: PointerEvent): void {
    if (!this.isOpen || !this.popupEl) return;
    const target = e.target as Node | null;
    if (target && !this.popupEl.contains(target) && !this.cornerAreaEl?.contains(target)) {
      this.close();
    }
  }

  private handleGlobalKeyDown(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public open(): void {
    if (this.isOpen) return;

    this.updateDimensions();

    this.popupEl = document.createElement('div');
    this.popupEl.className = 'tv-chart-floating-popup';
    this.popupEl.setAttribute('role', 'dialog');
    this.popupEl.setAttribute('aria-label', 'Chart Settings Popup');

    const h = this.options.chartManager.getTimeScaleHeight();
    this.popupEl.style.bottom = `${h + 4}px`;
    this.popupEl.style.right = '4px';

    // Header
    const header = document.createElement('div');
    header.className = 'tv-popup-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'tv-popup-title-wrap';
    const gearIcon = document.createElement('span');
    gearIcon.className = 'tv-popup-title-icon';
    gearIcon.innerHTML = getIcon('settings');
    const titleText = document.createElement('span');
    titleText.className = 'tv-popup-title';
    titleText.textContent = 'Chart Settings';
    titleWrap.appendChild(gearIcon);
    titleWrap.appendChild(titleText);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tv-popup-close-btn';
    closeBtn.type = 'button';
    closeBtn.title = 'Close (Esc)';
    closeBtn.innerHTML = getIcon('close');
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    this.popupEl.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'tv-popup-body';

    // 1. Primary Action Section: Reset Chart View
    const resetSection = document.createElement('div');
    resetSection.className = 'tv-popup-section';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'tv-popup-action-btn tv-reset-chart-btn';
    resetBtn.type = 'button';
    resetBtn.innerHTML = `
      <span class="btn-left">
        <span class="btn-icon">${getIcon('reset_view')}</span>
        <span class="btn-text">Reset chart view</span>
      </span>
      <kbd class="shortcut-badge">Alt+R</kbd>
    `;
    resetBtn.title = 'Restore default auto-scale and visible bars';

    resetBtn.addEventListener('click', () => {
      this.close();
      this.options.onResetChartView();
    });

    resetSection.appendChild(resetBtn);
    body.appendChild(resetSection);

    // 2. Scale Options Section
    const scalesSection = document.createElement('div');
    scalesSection.className = 'tv-popup-section';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'tv-popup-section-title';
    sectionTitle.textContent = 'PRICE SCALES';
    scalesSection.appendChild(sectionTitle);

    // Auto-scale toggle
    const autoScaleRow = document.createElement('label');
    autoScaleRow.className = 'tv-popup-toggle-row';
    const autoScaleCheckbox = document.createElement('input');
    autoScaleCheckbox.type = 'checkbox';
    autoScaleCheckbox.checked = this.options.chartManager.isAutoScale();
    autoScaleCheckbox.addEventListener('change', () => {
      this.options.chartManager.setAutoScale(autoScaleCheckbox.checked);
    });
    const autoScaleLabel = document.createElement('span');
    autoScaleLabel.textContent = 'Auto Scale (fit vertically)';
    autoScaleRow.appendChild(autoScaleCheckbox);
    autoScaleRow.appendChild(autoScaleLabel);
    scalesSection.appendChild(autoScaleRow);

    // Invert scale toggle
    const invertScaleRow = document.createElement('label');
    invertScaleRow.className = 'tv-popup-toggle-row';
    const invertCheckbox = document.createElement('input');
    invertCheckbox.type = 'checkbox';
    invertCheckbox.checked = this.options.chartManager.isInvertScale();
    invertCheckbox.addEventListener('change', () => {
      this.options.chartManager.setInvertScale(invertCheckbox.checked);
    });
    const invertLabel = document.createElement('span');
    invertLabel.textContent = 'Invert Price Scale';
    invertScaleRow.appendChild(invertCheckbox);
    invertScaleRow.appendChild(invertLabel);
    scalesSection.appendChild(invertScaleRow);

    body.appendChild(scalesSection);

    // 3. Additional Shortcuts / Utilities Section
    if (this.options.onOpenChartSettings || this.options.onRemoveAllDrawings) {
      const moreSection = document.createElement('div');
      moreSection.className = 'tv-popup-section';

      if (this.options.onOpenChartSettings) {
        const indBtn = document.createElement('button');
        indBtn.className = 'tv-popup-action-btn secondary';
        indBtn.type = 'button';
        indBtn.innerHTML = `
          <span class="btn-left">
            <span class="btn-icon">${getIcon('indicators')}</span>
            <span class="btn-text">Technical Indicators…</span>
          </span>
        `;
        indBtn.addEventListener('click', () => {
          this.close();
          this.options.onOpenChartSettings?.();
        });
        moreSection.appendChild(indBtn);
      }

      if (this.options.onRemoveAllDrawings) {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'tv-popup-action-btn secondary danger';
        clearBtn.type = 'button';
        clearBtn.innerHTML = `
          <span class="btn-left">
            <span class="btn-icon">${getIcon('trash')}</span>
            <span class="btn-text">Remove all drawings</span>
          </span>
        `;
        clearBtn.addEventListener('click', () => {
          this.close();
          this.options.onRemoveAllDrawings?.();
        });
        moreSection.appendChild(clearBtn);
      }

      body.appendChild(moreSection);
    }

    this.popupEl.appendChild(body);
    this.options.chartContainer.appendChild(this.popupEl);

    this.isOpen = true;
    this.buttonEl?.classList.add('active');
  }

  public close(): void {
    if (this.popupEl) {
      this.popupEl.remove();
      this.popupEl = null;
    }
    this.isOpen = false;
    this.buttonEl?.classList.remove('active');
  }

  public destroy(): void {
    this.close();
    if (this.cornerAreaEl) {
      this.cornerAreaEl.remove();
      this.cornerAreaEl = null;
    }
    this.buttonEl = null;
    window.removeEventListener('pointerdown', this.onGlobalPointerDownBound, true);
    window.removeEventListener('keydown', this.onGlobalKeyDownBound);
    window.removeEventListener('resize', this.onWindowResizeBound);
  }
}
