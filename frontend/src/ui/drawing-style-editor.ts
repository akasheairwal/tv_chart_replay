import type { DrawingEngine } from '../drawings/drawing-engine';
import type { DrawingDefinition, DrawingStyle } from '../drawings/drawing-types';
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
    this.render();
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.currentDrawing = null;
    this.el.style.display = 'none';
  }

  private render(): void {
    if (!this.currentDrawing) return;
    const d = this.currentDrawing;
    this.el.innerHTML = '';

    // Title / Type badge
    const badge = document.createElement('span');
    badge.className = 'style-editor-badge';
    badge.textContent = d.type.replace(/_/g, ' ').toUpperCase();
    this.el.appendChild(badge);

    this.addSep();

    // 1. Color Presets
    const colorGroup = document.createElement('div');
    colorGroup.className = 'style-btn-group';

    for (const color of COLOR_PRESETS) {
      const swatch = document.createElement('button');
      swatch.className = `style-color-swatch ${d.style.color === color ? 'active' : ''}`;
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
    colorPicker.value = d.style.color || '#2962ff';
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
      btn.className = `style-prop-btn ${d.style.width === w ? 'active' : ''}`;
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
      btn.className = `style-prop-btn ${(d.style.lineStyle || 'solid') === s.id ? 'active' : ''}`;
      btn.textContent = s.label;
      btn.title = `Line Style: ${s.id}`;
      btn.addEventListener('click', () => {
        this.updateStyle({ lineStyle: s.id });
      });
      styleGroup.appendChild(btn);
    }
    this.el.appendChild(styleGroup);

    // 4. Long / Short position lot size adjustment
    if (d.type === 'long_position' || d.type === 'short_position') {
      this.addSep();
      const lotWrap = document.createElement('div');
      lotWrap.className = 'style-input-wrap';
      lotWrap.innerHTML = `<span class="style-input-label">Lots:</span>`;
      const lotInput = document.createElement('input');
      lotInput.type = 'number';
      lotInput.step = '0.1';
      lotInput.min = '0.01';
      lotInput.className = 'style-num-input';
      lotInput.value = (d.style.lotSize || 1.0).toString();
      lotInput.title = 'Lot Size for dollar profit/loss calculations';
      lotInput.addEventListener('input', () => {
        const val = parseFloat(lotInput.value) || 1.0;
        this.updateStyle({ lotSize: val });
      });
      lotWrap.appendChild(lotInput);
      this.el.appendChild(lotWrap);
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

  private updateStyle(updates: Partial<DrawingStyle>): void {
    if (!this.currentDrawing) return;
    this.currentDrawing.style = { ...this.currentDrawing.style, ...updates };
    this.engine.updateDrawingStyle(this.currentDrawing.id, updates);
  }

  private addSep(): void {
    const sep = document.createElement('div');
    sep.className = 'style-editor-sep';
    this.el.appendChild(sep);
  }
}
