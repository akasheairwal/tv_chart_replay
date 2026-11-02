import type { DrawingEngine } from '../drawings/drawing-engine';
import type { DrawingDefinition, DrawingStyle, DrawingType } from '../drawings/drawing-types';
import { calculatePositionMetrics } from '../drawings/drawing-math';
import { getIcon } from './icons';
import { DrawingSettingsModal } from './drawing-settings-modal';
import { sanitizeHexColor } from './drawing-settings-widgets';

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
  public settingsModal: DrawingSettingsModal;
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
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.container.appendChild(this.el);

    this.settingsModal = new DrawingSettingsModal(this.engine);
    this.settingsModal.onSave = (saved) => {
      this.handleModalSave(saved);
    };
    this.settingsModal.onPreview = (draft) => {
      this.handleModalPreview(draft);
    };
    this.settingsModal.onCancel = (snapshot) => {
      this.handleModalCancel(snapshot);
    };
  }

  private handleModalSave(saved: DrawingDefinition): void {
    if (this.currentDrawing && (this.currentDrawing.id === saved.id || this.currentDrawing.type === saved.type)) {
      this.currentDrawing = this.engine.getSelectedDrawing() || saved;
      this.render();
    } else if (this.activeTool && (saved.id === `preset_${this.activeTool}` || saved.type === this.activeTool)) {
      this.render();
    }
  }

  private handleModalPreview(draft: DrawingDefinition): void {
    if (this.currentDrawing && this.currentDrawing.id === draft.id) {
      this.currentDrawing = draft;
      this.render();
    } else if (this.activeTool && draft.type === this.activeTool) {
      this.render();
    }
  }

  private handleModalCancel(snapshot: DrawingDefinition): void {
    if (this.currentDrawing && this.currentDrawing.id === snapshot.id) {
      this.currentDrawing = this.engine.getSelectedDrawing() || snapshot;
      this.render();
    } else if (this.activeTool && snapshot.type === this.activeTool) {
      this.render();
    }
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
    this.settingsModal.onCreateOrder = this.onCreateOrder;
    this.settingsModal.open(drawing);
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

    const currentHex = sanitizeHexColor(style.color).toLowerCase();

    for (const color of COLOR_PRESETS) {
      const swatch = document.createElement('button');
      swatch.className = `style-color-swatch ${currentHex === color.toLowerCase() ? 'active' : ''}`;
      swatch.style.backgroundColor = color;
      swatch.title = `Color: ${color}`;
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        this.updateStyle({ color });
      });
      colorGroup.appendChild(swatch);
    }

    // Native color input picker
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'style-color-input';
    colorPicker.value = currentHex;
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
      btn.className = `style-prop-btn ${(style.width ?? 1) === w ? 'active' : ''}`;
      btn.textContent = `${w}px`;
      btn.title = `Line Width: ${w}px`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
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
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
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
        orderBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.executeTradeFromDrawing(d);
        });
        this.el.appendChild(orderBtn);

        // Compact Stats Toggle
        const compactBtn = document.createElement('button');
        compactBtn.className = `style-action-btn ${d.style.compactStats ? 'active' : ''}`;
        compactBtn.innerHTML = `📊`;
        compactBtn.title = 'Toggle Compact Statistics Badge';
        compactBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const compactStats = !d.style.compactStats;
          this.updateStyle({ compactStats });
        });
        this.el.appendChild(compactBtn);
      }

      // 4b. Background Fill Toggle for Shapes & Channels
      const isShapeWithFill = [
        'rectangle',
        'rotated_rectangle',
        'circle',
        'ellipse',
        'triangle',
        'parallel_channel',
        'equidistant_channel',
        'fib_channel',
        'gann_box',
      ].includes(d.type);

      if (isShapeWithFill) {
        this.addSep();
        const fillToggleBtn = document.createElement('button');
        const isFilled = d.style.fillBackground !== false;
        fillToggleBtn.className = `style-prop-btn ${isFilled ? 'active' : ''}`;
        fillToggleBtn.textContent = 'Fill';
        fillToggleBtn.title = isFilled ? 'Disable Background Fill' : 'Enable Background Fill';
        fillToggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.updateStyle({ fillBackground: !isFilled });
        });
        this.el.appendChild(fillToggleBtn);
      }

      // 5. Text Input (if drawing has text/callout)
      if (d.type === 'text' || d.type === 'callout') {
        this.addSep();
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'style-text-input';
        textInput.value = d.style.textOptions?.content ?? d.style.text ?? '';
        textInput.placeholder = 'Label text…';
        textInput.addEventListener('input', () => {
          this.updateStyle({
            text: textInput.value,
            textOptions: d.style.textOptions
              ? { ...d.style.textOptions, content: textInput.value }
              : undefined,
          });
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

      // Settings
      const settingsBtn = document.createElement('button');
      settingsBtn.className = 'style-action-btn settings-btn';
      settingsBtn.innerHTML = getIcon('settings');
      settingsBtn.title = 'Drawing Settings';
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSettingsDialog(d);
      });
      actionsGroup.appendChild(settingsBtn);

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
    } else if (this.activeTool) {
      this.addSep();
      const actionsGroup = document.createElement('div');
      actionsGroup.className = 'style-btn-group';

      const settingsBtn = document.createElement('button');
      settingsBtn.className = 'style-action-btn settings-btn';
      settingsBtn.innerHTML = getIcon('settings');
      settingsBtn.title = `${this.activeTool.replace(/_/g, ' ').toUpperCase()} Default Settings`;
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const syntheticDrawing: DrawingDefinition = {
          id: `preset_${this.activeTool}`,
          type: this.activeTool!,
          symbol: (this.engine as any).currentSymbol || '',
          timeframe: (this.engine as any).currentTimeframe || '',
          points: [],
          style: { ...this.engine.getToolDefaultStyle(this.activeTool!) },
          locked: false,
          visible: true,
        };
        this.openSettingsDialog(syntheticDrawing);
      });
      actionsGroup.appendChild(settingsBtn);
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

  private addSep(): void {
    const sep = document.createElement('div');
    sep.className = 'style-editor-sep';
    this.el.appendChild(sep);
  }
}
