import type { DrawingEngine } from '../drawings/drawing-engine';
import { getIcon } from './icons';

export class DrawingListDialog {
  private overlayEl: HTMLElement;
  private contentEl: HTMLElement;
  private filterQuery = '';

  constructor(
    private readonly container: HTMLElement,
    private readonly engine: DrawingEngine,
  ) {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'modal-overlay drawing-list-modal';
    this.overlayEl.style.display = 'none';

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'modal-dialog tv-modal';
    this.overlayEl.appendChild(this.contentEl);
    this.container.appendChild(this.overlayEl);

    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) this.hide();
    });
  }

  show(): void {
    this.render();
    this.overlayEl.style.display = 'flex';
  }

  hide(): void {
    this.overlayEl.style.display = 'none';
  }

  private render(): void {
    const drawings = this.engine.getDrawings();
    const filtered = drawings.filter(
      (d) =>
        d.type.toLowerCase().includes(this.filterQuery.toLowerCase()) ||
        (d.style.text && d.style.text.toLowerCase().includes(this.filterQuery.toLowerCase())),
    );

    this.contentEl.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">
          <span class="modal-title-icon">${getIcon('list')}</span>
          <span>Drawing Objects Manager</span>
          <span class="drawing-count-badge">${drawings.length} total</span>
        </div>
        <button class="modal-close-btn" type="button">${getIcon('close')}</button>
      </div>

      <div class="modal-toolbar">
        <div class="drawing-filter-wrap">
          <span class="filter-icon">${getIcon('search')}</span>
          <input
            type="text"
            class="drawing-filter-input"
            placeholder="Filter drawings by type or text…"
            value="${this.filterQuery}"
          />
        </div>
        <div class="drawing-batch-actions">
          <button class="batch-btn show-all-btn" type="button" title="Show All">${getIcon('eye')} Show All</button>
          <button class="batch-btn hide-all-btn" type="button" title="Hide All">${getIcon('eye_off')} Hide All</button>
          <button class="batch-btn clear-all-btn" type="button" title="Clear All">${getIcon('clear')} Clear All</button>
        </div>
      </div>

      <div class="modal-body drawing-list-body">
        ${
          filtered.length === 0
            ? `<div class="drawing-list-empty">${drawings.length === 0 ? 'No drawings on this chart.' : 'No drawings match the filter.'}</div>`
            : `<div class="drawing-items-container"></div>`
        }
      </div>
    `;

    // Close button
    const closeBtn = this.contentEl.querySelector('.modal-close-btn');
    closeBtn?.addEventListener('click', () => this.hide());

    // Search filter input
    const filterInput = this.contentEl.querySelector<HTMLInputElement>('.drawing-filter-input');
    filterInput?.addEventListener('input', () => {
      this.filterQuery = filterInput.value;
      this.render();
      const updatedInput = this.contentEl.querySelector<HTMLInputElement>('.drawing-filter-input');
      if (updatedInput) {
        updatedInput.focus();
        updatedInput.selectionStart = updatedInput.selectionEnd = updatedInput.value.length;
      }
    });

    // Batch actions
    this.contentEl.querySelector('.show-all-btn')?.addEventListener('click', () => {
      this.engine.setAllVisibility(true);
      this.render();
    });
    this.contentEl.querySelector('.hide-all-btn')?.addEventListener('click', () => {
      this.engine.setAllVisibility(false);
      this.render();
    });
    this.contentEl.querySelector('.clear-all-btn')?.addEventListener('click', () => {
      this.engine.clearAll();
      this.render();
    });

    // Render items
    const itemsContainer = this.contentEl.querySelector('.drawing-items-container');
    if (itemsContainer) {
      for (const d of filtered) {
        const itemEl = document.createElement('div');
        itemEl.className = `drawing-list-item ${!d.visible ? 'hidden-item' : ''}`;

        const typeName = d.type.replace(/_/g, ' ').toUpperCase();
        const detailText =
          d.points.length > 0
            ? `Price: ${d.points[0].price.toFixed(4)} (${d.points.length} pts)`
            : '';

        itemEl.innerHTML = `
          <div class="drawing-item-info">
            <span class="drawing-item-swatch" style="background-color: ${d.style.color || '#2962ff'}"></span>
            <div class="drawing-item-meta">
              <span class="drawing-item-name">${d.style.text ? `${typeName} (${d.style.text})` : typeName}</span>
              <span class="drawing-item-detail">${detailText}</span>
            </div>
          </div>
          <div class="drawing-item-actions">
            <button class="item-action-btn settings-btn" title="Settings">${getIcon('settings')}</button>
            <button class="item-action-btn vis-btn" title="${d.visible ? 'Hide' : 'Show'}">${d.visible ? getIcon('eye') : getIcon('eye_off')}</button>
            <button class="item-action-btn lock-btn" title="${d.locked ? 'Unlock' : 'Lock'}">${d.locked ? getIcon('lock') : getIcon('unlock')}</button>
            <button class="item-action-btn delete-btn" title="Delete">${getIcon('trash')}</button>
          </div>
        `;

        itemEl.querySelector('.drawing-item-info')?.addEventListener('click', () => {
          this.engine.selectDrawing(d.id);
          this.hide();
        });

        itemEl.querySelector('.settings-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hide();
          this.engine.selectDrawing(d.id);
          if (this.engine.onOpenDrawingSettings) {
            this.engine.onOpenDrawingSettings(d);
          }
        });

        itemEl.querySelector('.vis-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.engine.toggleVisibility(d.id);
          this.render();
        });

        itemEl.querySelector('.lock-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.engine.toggleLock(d.id);
          this.render();
        });

        itemEl.querySelector('.delete-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.engine.deleteDrawing(d.id);
          this.render();
        });

        itemsContainer.appendChild(itemEl);
      }
    }
  }
}
