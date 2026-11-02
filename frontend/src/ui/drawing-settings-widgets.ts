/**
 * Reusable Widget Primitives for Unified Drawing Tool Settings Dialog (ADR 0006)
 *
 * Implements:
 * 1. ColorOpacityPicker
 * 2. LineWidthAndStyleSelector
 * 3. LevelsMatrixTable
 * 4. CoordinatesPointEditor
 * 5. TimeframeVisibilityMatrix
 * 6. TypographyEditor
 * 7. TemplateManager & TemplateMenu
 */

import {
  type DrawingPoint,
  type DrawingStyle,
  type DrawingType,
  type LevelRatioItem,
  type DrawingTextOptions,
  type DrawingVisibilityFilter,
  type DrawingTemplate,
  createDefaultFibLevels,
  createDefaultTextOptions,
  createDefaultVisibilityFilter,
} from '../drawings/drawing-types';
import { getIcon } from './icons';

export const COLOR_PRESETS = [
  '#2962ff', // Blue
  '#089981', // Green
  '#f23645', // Red
  '#ff9800', // Orange
  '#ab47bc', // Purple
  '#ffffff', // White
];

// ===========================================================================
// Color & DateTime Utilities
// ===========================================================================

export function sanitizeHexColor(color?: string): string {
  if (!color || typeof color !== 'string') return '#2962ff';
  const trimmed = color.trim().toLowerCase();

  // 6-digit hex: #rrggbb
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  // 8-digit hex: #rrggbbaa -> take first 7 chars
  if (/^#[0-9a-f]{8}$/i.test(trimmed)) {
    return trimmed.slice(0, 7).toLowerCase();
  }
  // 3-digit hex: #rgb -> expand
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
  }
  // 4-digit hex: #rgba -> expand first 3
  if (/^#[0-9a-f]{4}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
  }
  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, parseInt(rgbMatch[1], 10)));
    const g = Math.min(255, Math.max(0, parseInt(rgbMatch[2], 10)));
    const b = Math.min(255, Math.max(0, parseInt(rgbMatch[3], 10)));
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // Common named CSS color fallbacks
  const namedColors: Record<string, string> = {
    white: '#ffffff',
    black: '#000000',
    red: '#f23645',
    green: '#089981',
    blue: '#2962ff',
    orange: '#ff9800',
    purple: '#ab47bc',
    gray: '#787b86',
    grey: '#787b86',
  };
  if (namedColors[trimmed]) {
    return namedColors[trimmed];
  }

  return '#2962ff';
}

export function extractColorAndOpacity(
  colorStr?: string,
  defaultOpacity: number = 1.0
): { color: string; opacity: number } {
  if (!colorStr) return { color: '#2962ff', opacity: defaultOpacity };
  const trimmed = colorStr.trim();
  const rgbaMatch = trimmed.match(/^rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d\.]+)\s*\)/i);
  if (rgbaMatch) {
    const r = Math.min(255, Math.max(0, parseInt(rgbaMatch[1], 10)));
    const g = Math.min(255, Math.max(0, parseInt(rgbaMatch[2], 10)));
    const b = Math.min(255, Math.max(0, parseInt(rgbaMatch[3], 10)));
    const a = parseFloat(rgbaMatch[4]);
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return {
      color: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
      opacity: isNaN(a) ? defaultOpacity : Math.max(0, Math.min(1, a)),
    };
  }
  return {
    color: sanitizeHexColor(colorStr),
    opacity: defaultOpacity,
  };
}

export function formatLocalDateTime(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  if (isNaN(d.getTime())) return '';
  const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

export function parseLocalDateTime(isoLocalString: string): number | null {
  if (!isoLocalString) return null;
  const parsed = new Date(isoLocalString).getTime();
  if (isNaN(parsed)) return null;
  return Math.floor(parsed / 1000);
}

// ===========================================================================
// 1. Color & Opacity Picker
// ===========================================================================

export class ColorOpacityPicker {
  public readonly el: HTMLElement;
  private colorInput!: HTMLInputElement;
  private sliderInput!: HTMLInputElement;
  private valSpan!: HTMLElement;
  private swatches: HTMLButtonElement[] = [];

  private currentColor: string;
  private currentOpacity: number;

  constructor(
    initialColor: string = '#2962ff',
    initialOpacity?: number,
    private readonly onChange: (color: string, opacity: number) => void = () => {},
    private readonly sliderId?: string
  ) {
    const extracted = extractColorAndOpacity(initialColor, 1.0);
    this.currentColor = extracted.color;
    this.currentOpacity = initialOpacity !== undefined ? Math.max(0, Math.min(1, initialOpacity)) : extracted.opacity;

    this.el = document.createElement('div');
    this.el.className = 'tv-widget-color-opacity';
    this.render();
  }

  private render(): void {
    this.el.innerHTML = '';

    const topRow = document.createElement('div');
    topRow.className = 'tv-color-top-row';

    // Preset Swatches
    const swatchGroup = document.createElement('div');
    swatchGroup.className = 'tv-color-swatches';
    this.swatches = [];

    for (const color of COLOR_PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tv-color-swatch ${sanitizeHexColor(this.currentColor) === color.toLowerCase() ? 'active' : ''}`;
      btn.style.backgroundColor = color;
      btn.title = color;
      btn.addEventListener('click', () => {
        this.currentColor = color;
        this.colorInput.value = sanitizeHexColor(color);
        this.updateActiveSwatch();
        this.onChange(this.currentColor, this.currentOpacity);
      });
      swatchGroup.appendChild(btn);
      this.swatches.push(btn);
    }
    topRow.appendChild(swatchGroup);

    // Custom Color Input
    const pickerWrap = document.createElement('div');
    pickerWrap.className = 'tv-color-picker-wrap';
    this.colorInput = document.createElement('input');
    this.colorInput.type = 'color';
    this.colorInput.className = 'tv-color-picker-input';
    this.colorInput.value = sanitizeHexColor(this.currentColor);
    this.colorInput.title = 'Custom Color';
    this.colorInput.addEventListener('input', () => {
      this.currentColor = this.colorInput.value;
      this.updateActiveSwatch();
      this.onChange(this.currentColor, this.currentOpacity);
    });
    pickerWrap.appendChild(this.colorInput);
    topRow.appendChild(pickerWrap);

    this.el.appendChild(topRow);

    // Opacity Slider Row
    const sliderRow = document.createElement('div');
    sliderRow.className = 'tv-opacity-slider-row';

    const label = document.createElement('span');
    label.className = 'tv-slider-label';
    label.textContent = 'Opacity:';
    sliderRow.appendChild(label);

    this.sliderInput = document.createElement('input');
    if (this.sliderId) {
      this.sliderInput.id = this.sliderId;
    }
    this.sliderInput.type = 'range';
    this.sliderInput.className = 'tv-opacity-range';
    this.sliderInput.min = '0';
    this.sliderInput.max = '100';
    this.sliderInput.step = '1';
    this.sliderInput.value = String(Math.round(this.currentOpacity * 100));

    this.valSpan = document.createElement('span');
    this.valSpan.className = 'tv-opacity-val-badge';
    this.valSpan.textContent = `${this.sliderInput.value}%`;

    this.sliderInput.addEventListener('input', () => {
      this.currentOpacity = parseInt(this.sliderInput.value, 10) / 100;
      this.valSpan.textContent = `${this.sliderInput.value}%`;
      this.onChange(this.currentColor, this.currentOpacity);
    });

    sliderRow.appendChild(this.sliderInput);
    sliderRow.appendChild(this.valSpan);
    this.el.appendChild(sliderRow);
  }

  private updateActiveSwatch(): void {
    const activeHex = sanitizeHexColor(this.currentColor);
    for (const btn of this.swatches) {
      if (btn.title.toLowerCase() === activeHex) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  }

  setValue(color: string, opacity?: number): void {
    const extracted = extractColorAndOpacity(color, opacity ?? 1.0);
    this.currentColor = extracted.color;
    this.currentOpacity = opacity !== undefined ? Math.max(0, Math.min(1, opacity)) : extracted.opacity;
    this.colorInput.value = sanitizeHexColor(this.currentColor);
    this.sliderInput.value = String(Math.round(this.currentOpacity * 100));
    this.valSpan.textContent = `${this.sliderInput.value}%`;
    this.updateActiveSwatch();
  }

  getValue(): { color: string; opacity: number } {
    return { color: this.currentColor, opacity: this.currentOpacity };
  }
}

// ===========================================================================
// 2. Line Width & Style Selector
// ===========================================================================

export class LineWidthAndStyleSelector {
  public readonly el: HTMLElement;
  private currentWidth: number;
  private currentStyle: 'solid' | 'dashed' | 'dotted';

  private widthButtons: HTMLButtonElement[] = [];
  private styleButtons: HTMLButtonElement[] = [];

  constructor(
    initialWidth: number = 2,
    initialStyle: 'solid' | 'dashed' | 'dotted' = 'solid',
    private readonly onChange: (width: number, style: 'solid' | 'dashed' | 'dotted') => void
  ) {
    this.currentWidth = initialWidth;
    this.currentStyle = initialStyle;

    this.el = document.createElement('div');
    this.el.className = 'tv-widget-width-style';
    this.render();
  }

  private render(): void {
    this.el.innerHTML = '';

    // Width Group
    const widthGroup = document.createElement('div');
    widthGroup.className = 'tv-pill-group width-group';
    this.widthButtons = [];

    for (const w of [1, 2, 3, 4]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tv-pill-btn ${this.currentWidth === w ? 'active' : ''}`;
      btn.textContent = `${w}px`;
      btn.addEventListener('click', () => {
        this.currentWidth = w;
        this.updateActiveButtons();
        this.onChange(this.currentWidth, this.currentStyle);
      });
      widthGroup.appendChild(btn);
      this.widthButtons.push(btn);
    }
    this.el.appendChild(widthGroup);

    // Style Group
    const styleGroup = document.createElement('div');
    styleGroup.className = 'tv-pill-group style-group';
    this.styleButtons = [];

    const styles: Array<{ id: 'solid' | 'dashed' | 'dotted'; label: string }> = [
      { id: 'solid', label: '—' },
      { id: 'dashed', label: '---' },
      { id: 'dotted', label: '···' },
    ];

    for (const s of styles) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tv-pill-btn ${this.currentStyle === s.id ? 'active' : ''}`;
      btn.textContent = s.label;
      btn.title = `Line Style: ${s.id}`;
      btn.addEventListener('click', () => {
        this.currentStyle = s.id;
        this.updateActiveButtons();
        this.onChange(this.currentWidth, this.currentStyle);
      });
      styleGroup.appendChild(btn);
      this.styleButtons.push(btn);
    }
    this.el.appendChild(styleGroup);
  }

  private updateActiveButtons(): void {
    for (let i = 0; i < this.widthButtons.length; i++) {
      this.widthButtons[i].classList.toggle('active', i + 1 === this.currentWidth);
    }
    for (const btn of this.styleButtons) {
      btn.classList.toggle('active', btn.title.includes(this.currentStyle));
    }
  }

  setValue(width: number, style: 'solid' | 'dashed' | 'dotted'): void {
    this.currentWidth = width;
    this.currentStyle = style;
    this.updateActiveButtons();
  }

  getValue(): { width: number; style: 'solid' | 'dashed' | 'dotted' } {
    return { width: this.currentWidth, style: this.currentStyle };
  }
}

// ===========================================================================
// 3. Levels Matrix Table (Fibonacci, Gann, Pitchforks)
// ===========================================================================

export interface LevelsMatrixOptions {
  useOneColor?: boolean;
  fillBackground?: boolean;
  backgroundOpacity?: number;
  reverse?: boolean;
}

export class LevelsMatrixTable {
  public readonly el: HTMLElement;
  private levels: LevelRatioItem[];
  private options: LevelsMatrixOptions;

  constructor(
    initialLevels?: LevelRatioItem[],
    initialOptions?: LevelsMatrixOptions,
    private readonly onChange?: (levels: LevelRatioItem[], options: LevelsMatrixOptions) => void
  ) {
    this.levels = initialLevels && initialLevels.length > 0 ? initialLevels : createDefaultFibLevels();
    this.options = {
      useOneColor: false,
      fillBackground: true,
      backgroundOpacity: 0.15,
      reverse: false,
      ...initialOptions,
    };

    this.el = document.createElement('div');
    this.el.className = 'tv-widget-levels-matrix';
    this.render();
  }

  private render(): void {
    this.el.innerHTML = '';

    // Master Header Controls
    const topBar = document.createElement('div');
    topBar.className = 'tv-levels-top-bar';

    // Use one color toggle
    const oneColorLabel = document.createElement('label');
    oneColorLabel.className = 'tv-checkbox-label';
    const oneColorCb = document.createElement('input');
    oneColorCb.type = 'checkbox';
    oneColorCb.checked = this.options.useOneColor === true;
    oneColorCb.addEventListener('change', () => {
      this.options.useOneColor = oneColorCb.checked;
      this.renderTable();
      this.emitChange();
    });
    oneColorLabel.appendChild(oneColorCb);
    oneColorLabel.appendChild(document.createTextNode(' Use One Color'));
    topBar.appendChild(oneColorLabel);

    // Background fill toggle
    const bgLabel = document.createElement('label');
    bgLabel.className = 'tv-checkbox-label';
    const bgCb = document.createElement('input');
    bgCb.type = 'checkbox';
    bgCb.checked = this.options.fillBackground === true;
    bgCb.addEventListener('change', () => {
      this.options.fillBackground = bgCb.checked;
      this.emitChange();
    });
    bgLabel.appendChild(bgCb);
    bgLabel.appendChild(document.createTextNode(' Background Fill'));
    topBar.appendChild(bgLabel);

    // Reverse levels toggle
    const revLabel = document.createElement('label');
    revLabel.className = 'tv-checkbox-label';
    const revCb = document.createElement('input');
    revCb.type = 'checkbox';
    revCb.checked = this.options.reverse === true;
    revCb.addEventListener('change', () => {
      this.options.reverse = revCb.checked;
      this.emitChange();
    });
    revLabel.appendChild(revCb);
    revLabel.appendChild(document.createTextNode(' Reverse'));
    topBar.appendChild(revLabel);

    this.el.appendChild(topBar);

    // Table Container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'tv-levels-table-container';
    this.el.appendChild(tableContainer);
    this.renderTable();
  }

  private renderTable(): void {
    let container = this.el.querySelector('.tv-levels-table-container');
    if (!container) return;
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'tv-levels-grid';

    for (const item of this.levels) {
      const row = document.createElement('div');
      row.className = `tv-level-row ${!item.enabled ? 'disabled' : ''}`;

      // Checkbox
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = item.enabled;
      cb.addEventListener('change', () => {
        item.enabled = cb.checked;
        row.classList.toggle('disabled', !item.enabled);
        this.emitChange();
      });
      row.appendChild(cb);

      // Coefficient input
      const coeffInput = document.createElement('input');
      coeffInput.type = 'number';
      coeffInput.step = '0.001';
      coeffInput.className = 'tv-level-coeff-input';
      coeffInput.value = String(item.coeff);
      coeffInput.addEventListener('input', () => {
        item.coeff = parseFloat(coeffInput.value) || 0;
        this.emitChange();
      });
      row.appendChild(coeffInput);

      // Color picker
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'tv-level-color-input';
      colorInput.value = sanitizeHexColor(item.color || '#787b86');
      colorInput.disabled = this.options.useOneColor === true;
      colorInput.addEventListener('input', () => {
        item.color = colorInput.value;
        this.emitChange();
      });
      row.appendChild(colorInput);

      // Line width select
      const widthSelect = document.createElement('select');
      widthSelect.className = 'tv-level-width-select';
      for (const w of [1, 2, 3]) {
        const opt = document.createElement('option');
        opt.value = String(w);
        opt.textContent = `${w}px`;
        opt.selected = (item.width || 1) === w;
        widthSelect.appendChild(opt);
      }
      widthSelect.addEventListener('change', () => {
        item.width = parseInt(widthSelect.value, 10);
        this.emitChange();
      });
      row.appendChild(widthSelect);

      grid.appendChild(row);
    }

    container.appendChild(grid);
  }

  private emitChange(): void {
    if (this.onChange) {
      this.onChange(this.levels, this.options);
    }
  }

  setLevels(levels: LevelRatioItem[], options?: Partial<LevelsMatrixOptions>): void {
    this.levels = levels;
    if (options) Object.assign(this.options, options);
    this.render();
  }

  getLevels(): LevelRatioItem[] {
    return this.levels;
  }

  getOptions(): LevelsMatrixOptions {
    return this.options;
  }
}

// ===========================================================================
// 4. Coordinates Point Editor
// ===========================================================================

export class CoordinatesPointEditor {
  public readonly el: HTMLElement;
  private points: DrawingPoint[];

  constructor(
    initialPoints: DrawingPoint[],
    private readonly onChange: (points: DrawingPoint[]) => void
  ) {
    this.points = initialPoints.map((p) => ({ ...p }));
    this.el = document.createElement('div');
    this.el.className = 'tv-widget-coords-editor';
    this.render();
  }

  private render(): void {
    this.el.innerHTML = '';

    if (this.points.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tv-coord-empty';
      empty.style.color = '#787b86';
      empty.style.padding = '16px';
      empty.style.textAlign = 'center';
      empty.textContent = 'No coordinate points available for default preset.';
      this.el.appendChild(empty);
      return;
    }

    for (let i = 0; i < this.points.length; i++) {
      const pt = this.points[i];
      const card = document.createElement('div');
      card.className = 'tv-coord-point-card';

      const title = document.createElement('div');
      title.className = 'tv-coord-card-title';
      title.textContent = `Point ${i + 1}`;
      card.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'tv-coord-grid';

      // Price input
      const priceGroup = document.createElement('div');
      priceGroup.className = 'tv-coord-group';
      const priceLabel = document.createElement('label');
      priceLabel.textContent = 'Price:';
      const priceInput = document.createElement('input');
      priceInput.type = 'number';
      priceInput.step = '0.0001';
      priceInput.className = 'tv-coord-input';
      priceInput.value = String(pt.price);
      const handlePrice = () => {
        const val = parseFloat(priceInput.value);
        if (!isNaN(val)) {
          pt.price = val;
          this.onChange(this.points);
        }
      };
      priceInput.addEventListener('input', handlePrice);
      priceInput.addEventListener('change', handlePrice);
      priceGroup.appendChild(priceLabel);
      priceGroup.appendChild(priceInput);
      grid.appendChild(priceGroup);

      // Date / Time input
      const timeGroup = document.createElement('div');
      timeGroup.className = 'tv-coord-group';
      const timeLabel = document.createElement('label');
      timeLabel.textContent = 'Date & Time:';
      const timeInput = document.createElement('input');
      timeInput.type = 'datetime-local';
      timeInput.className = 'tv-coord-input';

      // Convert local wall-clock time to YYYY-MM-DDTHH:mm
      timeInput.value = formatLocalDateTime(pt.timestamp);

      const handleTime = () => {
        const ts = parseLocalDateTime(timeInput.value);
        if (ts !== null) {
          pt.timestamp = ts;
          this.onChange(this.points);
        }
      };
      timeInput.addEventListener('change', handleTime);
      timeInput.addEventListener('input', handleTime);
      timeGroup.appendChild(timeLabel);
      timeGroup.appendChild(timeInput);
      grid.appendChild(timeGroup);

      card.appendChild(grid);
      this.el.appendChild(card);
    }
  }

  setPoints(points: DrawingPoint[]): void {
    this.points = points.map((p) => ({ ...p }));
    this.render();
  }

  getPoints(): DrawingPoint[] {
    return this.points;
  }
}

// ===========================================================================
// 5. Timeframe Visibility Matrix
// ===========================================================================

export class TimeframeVisibilityMatrix {
  public readonly el: HTMLElement;
  private filter: DrawingVisibilityFilter;

  constructor(
    initialFilter?: DrawingVisibilityFilter,
    private readonly onChange?: (filter: DrawingVisibilityFilter) => void
  ) {
    const def = createDefaultVisibilityFilter();
    this.filter = {
      ticks: initialFilter?.ticks ?? def.ticks,
      seconds: { ...def.seconds, ...(initialFilter?.seconds || {}) },
      minutes: { ...def.minutes, ...(initialFilter?.minutes || {}) },
      hours: { ...def.hours, ...(initialFilter?.hours || {}) },
      days: initialFilter?.days ?? def.days,
      weeks: initialFilter?.weeks ?? def.weeks,
      months: initialFilter?.months ?? def.months,
    };
    this.el = document.createElement('div');
    this.el.className = 'tv-widget-vis-matrix';
    this.render();
  }

  private render(): void {
    this.el.innerHTML = '';

    // Quick Presets
    const presetsBar = document.createElement('div');
    presetsBar.className = 'tv-vis-presets-bar';

    const pAll = document.createElement('button');
    pAll.type = 'button';
    pAll.className = 'tv-vis-preset-btn';
    pAll.textContent = 'All Timeframes';
    pAll.addEventListener('click', () => {
      this.filter = createDefaultVisibilityFilter();
      this.render();
      this.emitChange();
    });
    presetsBar.appendChild(pAll);

    const pIntra = document.createElement('button');
    pIntra.type = 'button';
    pIntra.className = 'tv-vis-preset-btn';
    pIntra.textContent = 'Intraday Only (< 1D)';
    pIntra.addEventListener('click', () => {
      this.filter = {
        ticks: true,
        seconds: { enabled: true, minMinutes: 0.0166, maxMinutes: 0.99 },
        minutes: { enabled: true, minMinutes: 1, maxMinutes: 59 },
        hours: { enabled: true, minMinutes: 60, maxMinutes: 1439 },
        days: false,
        weeks: false,
        months: false,
      };
      this.render();
      this.emitChange();
    });
    presetsBar.appendChild(pIntra);

    const pMacro = document.createElement('button');
    pMacro.type = 'button';
    pMacro.className = 'tv-vis-preset-btn';
    pMacro.textContent = 'Daily & Above (≥ 1D)';
    pMacro.addEventListener('click', () => {
      this.filter = {
        ticks: false,
        seconds: { enabled: false },
        minutes: { enabled: false },
        hours: { enabled: false },
        days: true,
        weeks: true,
        months: true,
      };
      this.render();
      this.emitChange();
    });
    presetsBar.appendChild(pMacro);

    this.el.appendChild(presetsBar);

    // Filter Items List
    const list = document.createElement('div');
    list.className = 'tv-vis-items-list';

    // Ticks
    list.appendChild(this.createSimpleToggle('Ticks', this.filter.ticks, (val) => {
      this.filter.ticks = val;
      this.emitChange();
    }));

    // Seconds with range
    list.appendChild(this.createRangeToggle(
      'Seconds',
      this.filter.seconds.enabled,
      Math.round((this.filter.seconds.minMinutes ?? 0.0166) * 60),
      Math.round((this.filter.seconds.maxMinutes ?? 0.99) * 60),
      's',
      (enabled, min, max) => {
        this.filter.seconds.enabled = enabled;
        this.filter.seconds.minMinutes = min / 60;
        this.filter.seconds.maxMinutes = max / 60;
        this.emitChange();
      }
    ));

    // Minutes with range
    list.appendChild(this.createRangeToggle(
      'Minutes',
      this.filter.minutes.enabled,
      this.filter.minutes.minMinutes ?? 1,
      this.filter.minutes.maxMinutes ?? 59,
      'm',
      (enabled, min, max) => {
        this.filter.minutes.enabled = enabled;
        this.filter.minutes.minMinutes = min;
        this.filter.minutes.maxMinutes = max;
        this.emitChange();
      }
    ));

    // Hours with range
    list.appendChild(this.createRangeToggle(
      'Hours',
      this.filter.hours.enabled,
      Math.round((this.filter.hours.minMinutes ?? 60) / 60),
      Math.round((this.filter.hours.maxMinutes ?? 1439) / 60),
      'h',
      (enabled, min, max) => {
        this.filter.hours.enabled = enabled;
        this.filter.hours.minMinutes = min * 60;
        this.filter.hours.maxMinutes = max * 60;
        this.emitChange();
      }
    ));

    // Days
    list.appendChild(this.createSimpleToggle('Days (1D, etc.)', this.filter.days, (val) => {
      this.filter.days = val;
      this.emitChange();
    }));

    // Weeks
    list.appendChild(this.createSimpleToggle('Weeks (1W, etc.)', this.filter.weeks, (val) => {
      this.filter.weeks = val;
      this.emitChange();
    }));

    // Months
    list.appendChild(this.createSimpleToggle('Months (1M, etc.)', this.filter.months, (val) => {
      this.filter.months = val;
      this.emitChange();
    }));

    this.el.appendChild(list);
  }

  private createSimpleToggle(label: string, checked: boolean, onToggle: (val: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tv-vis-row';

    const lbl = document.createElement('label');
    lbl.className = 'tv-checkbox-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', () => onToggle(cb.checked));

    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(` ${label}`));
    row.appendChild(lbl);
    return row;
  }

  private createRangeToggle(
    label: string,
    enabled: boolean,
    minVal: number,
    maxVal: number,
    unit: string,
    onUpdate: (enabled: boolean, min: number, max: number) => void
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tv-vis-row range';

    const lbl = document.createElement('label');
    lbl.className = 'tv-checkbox-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = enabled;
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(` ${label}`));
    row.appendChild(lbl);

    const rangeInputs = document.createElement('div');
    rangeInputs.className = 'tv-vis-range-inputs';

    const minInp = document.createElement('input');
    minInp.type = 'number';
    minInp.className = 'tv-vis-range-inp';
    minInp.value = String(minVal);
    minInp.min = '1';

    const toSpan = document.createElement('span');
    toSpan.textContent = ' to ';

    const maxInp = document.createElement('input');
    maxInp.type = 'number';
    maxInp.className = 'tv-vis-range-inp';
    maxInp.value = String(maxVal);

    const unitSpan = document.createElement('span');
    unitSpan.textContent = ` ${unit}`;

    const handleUpdate = () => {
      const min = parseInt(minInp.value, 10) || 1;
      const max = parseInt(maxInp.value, 10) || 1;
      onUpdate(cb.checked, min, max);
    };

    cb.addEventListener('change', handleUpdate);
    minInp.addEventListener('input', handleUpdate);
    maxInp.addEventListener('input', handleUpdate);

    rangeInputs.appendChild(minInp);
    rangeInputs.appendChild(toSpan);
    rangeInputs.appendChild(maxInp);
    rangeInputs.appendChild(unitSpan);
    row.appendChild(rangeInputs);

    return row;
  }

  private emitChange(): void {
    if (this.onChange) this.onChange(this.filter);
  }

  setFilter(filter: DrawingVisibilityFilter): void {
    this.filter = JSON.parse(JSON.stringify(filter));
    this.render();
  }

  getFilter(): DrawingVisibilityFilter {
    return this.filter;
  }
}

// ===========================================================================
// 6. Typography & Text Options Editor
// ===========================================================================

export class TypographyEditor {
  public readonly el: HTMLElement;
  private options: DrawingTextOptions;

  constructor(
    initialOptions?: DrawingTextOptions,
    private readonly onChange?: (options: DrawingTextOptions) => void
  ) {
    this.options = initialOptions ? { ...initialOptions } : createDefaultTextOptions();
    this.el = document.createElement('div');
    this.el.className = 'tv-widget-typography-editor';
    this.render();
  }

  private render(): void {
    this.el.innerHTML = '';

    // Content Textarea
    const areaGroup = document.createElement('div');
    areaGroup.className = 'tv-text-area-group';
    const area = document.createElement('textarea');
    area.className = 'tv-settings-textarea';
    area.placeholder = 'Type annotation text here...';
    area.value = this.options.content || '';
    area.addEventListener('input', () => {
      this.options.content = area.value;
      this.emitChange();
    });
    areaGroup.appendChild(area);
    this.el.appendChild(areaGroup);

    // Font Controls Row
    const fontRow = document.createElement('div');
    fontRow.className = 'tv-font-controls-row';

    // Size dropdown
    const sizeSelect = document.createElement('select');
    sizeSelect.className = 'tv-font-size-select';
    for (const sz of [10, 12, 14, 16, 20, 24, 28, 32, 40]) {
      const opt = document.createElement('option');
      opt.value = String(sz);
      opt.textContent = `${sz}px`;
      opt.selected = this.options.fontSize === sz;
      sizeSelect.appendChild(opt);
    }
    sizeSelect.value = String(this.options.fontSize || 14);
    sizeSelect.addEventListener('change', () => {
      this.options.fontSize = parseInt(sizeSelect.value, 10);
      this.emitChange();
    });
    fontRow.appendChild(sizeSelect);

    // Bold button
    const boldBtn = document.createElement('button');
    boldBtn.type = 'button';
    boldBtn.className = `tv-pill-btn bold ${this.options.fontBold ? 'active' : ''}`;
    boldBtn.textContent = 'B';
    boldBtn.title = 'Bold';
    boldBtn.addEventListener('click', () => {
      this.options.fontBold = !this.options.fontBold;
      boldBtn.classList.toggle('active', this.options.fontBold);
      this.emitChange();
    });
    fontRow.appendChild(boldBtn);

    // Italic button
    const italicBtn = document.createElement('button');
    italicBtn.type = 'button';
    italicBtn.className = `tv-pill-btn italic ${this.options.fontItalic ? 'active' : ''}`;
    italicBtn.textContent = 'I';
    italicBtn.title = 'Italic';
    italicBtn.addEventListener('click', () => {
      this.options.fontItalic = !this.options.fontItalic;
      italicBtn.classList.toggle('active', this.options.fontItalic);
      this.emitChange();
    });
    fontRow.appendChild(italicBtn);

    // Text Color Input
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'tv-color-picker-input';
    colorInput.value = sanitizeHexColor(this.options.textColor || '#ffffff');
    colorInput.addEventListener('input', () => {
      this.options.textColor = colorInput.value;
      this.emitChange();
    });
    fontRow.appendChild(colorInput);

    this.el.appendChild(fontRow);

    // Alignment Matrix
    const alignRow = document.createElement('div');
    alignRow.className = 'tv-align-controls-row';

    const hAlignSelect = document.createElement('select');
    hAlignSelect.className = 'tv-align-select';
    for (const h of [
      { val: 'left', label: 'Left (◄)' },
      { val: 'center', label: 'Center (▲)' },
      { val: 'right', label: 'Right (►)' },
    ]) {
      const opt = document.createElement('option');
      opt.value = h.val;
      opt.textContent = h.label;
      opt.selected = this.options.hAlign === h.val;
      hAlignSelect.appendChild(opt);
    }
    hAlignSelect.value = this.options.hAlign || 'center';
    hAlignSelect.addEventListener('change', () => {
      this.options.hAlign = hAlignSelect.value as any;
      this.emitChange();
    });
    alignRow.appendChild(hAlignSelect);

    const vAlignSelect = document.createElement('select');
    vAlignSelect.className = 'tv-align-select';
    for (const v of [
      { val: 'top', label: 'Top (▲)' },
      { val: 'middle', label: 'Middle (■)' },
      { val: 'bottom', label: 'Bottom (▼)' },
    ]) {
      const opt = document.createElement('option');
      opt.value = v.val;
      opt.textContent = v.label;
      opt.selected = this.options.vAlign === v.val;
      vAlignSelect.appendChild(opt);
    }
    vAlignSelect.value = this.options.vAlign || 'middle';
    vAlignSelect.addEventListener('change', () => {
      this.options.vAlign = vAlignSelect.value as any;
      this.emitChange();
    });
    alignRow.appendChild(vAlignSelect);

    this.el.appendChild(alignRow);
  }

  private emitChange(): void {
    if (this.onChange) this.onChange(this.options);
  }

  setValue(options: DrawingTextOptions): void {
    this.options = { ...options };
    this.render();
  }

  getValue(): DrawingTextOptions {
    return this.options;
  }
}

// ===========================================================================
// 7. Template Manager & Presets Menu
// ===========================================================================

export class TemplateManager {
  static getStorageKey(toolType: DrawingType): string {
    return `tv_drawing_templates_${toolType}`;
  }

  static getDefaultKey(toolType: DrawingType): string {
    return `tv_drawing_default_${toolType}`;
  }

  static getTemplates(toolType: DrawingType): DrawingTemplate[] {
    try {
      const raw = localStorage.getItem(TemplateManager.getStorageKey(toolType));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static saveTemplate(toolType: DrawingType, name: string, style: Partial<DrawingStyle>): DrawingTemplate {
    const list = TemplateManager.getTemplates(toolType);
    const newTpl: DrawingTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim() || 'Custom Preset',
      toolType,
      style: JSON.parse(JSON.stringify(style)),
      createdAt: Date.now(),
    };
    list.push(newTpl);
    try {
      localStorage.setItem(TemplateManager.getStorageKey(toolType), JSON.stringify(list));
    } catch {
      // ignore
    }
    return newTpl;
  }

  static deleteTemplate(toolType: DrawingType, templateId: string): void {
    const list = TemplateManager.getTemplates(toolType).filter((t) => t.id !== templateId);
    try {
      localStorage.setItem(TemplateManager.getStorageKey(toolType), JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  static getDefaultStyle(toolType: DrawingType): Partial<DrawingStyle> | null {
    try {
      const raw = localStorage.getItem(TemplateManager.getDefaultKey(toolType));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static saveAsDefault(toolType: DrawingType, style: Partial<DrawingStyle>): void {
    try {
      localStorage.setItem(TemplateManager.getDefaultKey(toolType), JSON.stringify(style));
    } catch {
      // ignore
    }
  }

  static resetDefault(toolType: DrawingType): void {
    try {
      localStorage.removeItem(TemplateManager.getDefaultKey(toolType));
    } catch {
      // ignore
    }
  }
}

export class TemplateMenu {
  public readonly el: HTMLElement;
  private dropdownEl: HTMLElement | null = null;

  constructor(
    private readonly toolType: DrawingType,
    private readonly getCurrentStyle: () => Partial<DrawingStyle>,
    private readonly onApplyStyle: (style: Partial<DrawingStyle>) => void,
    private readonly getDefaultStyle?: () => Partial<DrawingStyle>
  ) {
    this.el = document.createElement('div');
    this.el.className = 'tv-template-menu-wrap';
    this.render();
  }

  private render(): void {
    this.el.innerHTML = '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tv-modal-btn template';
    btn.innerHTML = `Template ${getIcon('chevron_down')}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    this.el.appendChild(btn);
  }

  private toggleDropdown(): void {
    if (this.dropdownEl) {
      this.closeDropdown();
      return;
    }

    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'tv-template-dropdown';

    // 1. Save As...
    const saveAsItem = document.createElement('div');
    saveAsItem.className = 'tv-template-item';
    saveAsItem.textContent = 'Save As...';
    saveAsItem.addEventListener('click', () => {
      this.closeDropdown();
      const name = window.prompt('Enter Template Name:');
      if (name && name.trim()) {
        TemplateManager.saveTemplate(this.toolType, name, this.getCurrentStyle());
      }
    });
    this.dropdownEl.appendChild(saveAsItem);

    // 2. Apply Default
    const applyDefItem = document.createElement('div');
    applyDefItem.className = 'tv-template-item';
    applyDefItem.textContent = 'Apply Default';
    applyDefItem.addEventListener('click', () => {
      this.closeDropdown();
      const def =
        TemplateManager.getDefaultStyle(this.toolType) ||
        (this.getDefaultStyle ? this.getDefaultStyle() : null);
      if (def) {
        this.onApplyStyle(def);
      }
    });
    this.dropdownEl.appendChild(applyDefItem);

    // 3. Save as Default
    const saveDefItem = document.createElement('div');
    saveDefItem.className = 'tv-template-item';
    saveDefItem.textContent = 'Save as Default';
    saveDefItem.addEventListener('click', () => {
      this.closeDropdown();
      TemplateManager.saveAsDefault(this.toolType, this.getCurrentStyle());
    });
    this.dropdownEl.appendChild(saveDefItem);

    // User Saved Presets
    const templates = TemplateManager.getTemplates(this.toolType);
    if (templates.length > 0) {
      const sep = document.createElement('div');
      sep.className = 'tv-template-divider';
      this.dropdownEl.appendChild(sep);

      for (const tpl of templates) {
        const tplRow = document.createElement('div');
        tplRow.className = 'tv-template-item user-preset';
        tplRow.addEventListener('click', () => {
          this.closeDropdown();
          this.onApplyStyle(tpl.style);
        });

        const nameSpan = document.createElement('span');
        nameSpan.textContent = tpl.name;
        nameSpan.className = 'tv-tpl-name';
        tplRow.appendChild(nameSpan);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'tv-tpl-del-btn';
        delBtn.innerHTML = getIcon('trash');
        delBtn.title = 'Delete Preset';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          TemplateManager.deleteTemplate(this.toolType, tpl.id);
          tplRow.remove();
        });
        tplRow.appendChild(delBtn);

        this.dropdownEl.appendChild(tplRow);
      }
    }

    this.el.appendChild(this.dropdownEl);

    // Auto-dismiss on click outside
    const dismiss = (e: MouseEvent) => {
      if (!this.el.contains(e.target as Node)) {
        this.closeDropdown();
        document.removeEventListener('click', dismiss);
      }
    };
    document.addEventListener('click', dismiss);
  }

  private closeDropdown(): void {
    if (this.dropdownEl) {
      this.dropdownEl.remove();
      this.dropdownEl = null;
    }
  }
}
