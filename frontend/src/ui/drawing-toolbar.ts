import type { DrawingEngine } from '../drawings/drawing-engine';
import {
  TOOL_CATEGORIES,
  type DrawingType,
  type ToolCategory,
} from '../drawings/drawing-types';
import { getIcon } from './icons';

export class DrawingToolbar {
  private activeCategory = 'cursor';
  private activeTool: DrawingType = 'cursor';
  private categoryBtns = new Map<string, HTMLButtonElement>();
  private flyoutEl: HTMLElement | null = null;
  private openCategory: string | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly engine: DrawingEngine,
    private readonly onOpenDrawingList?: () => void,
  ) {
    this.render();
    this.wireGlobalEvents();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'drawing-toolbar-wrapper';

    const bar = document.createElement('div');
    bar.className = 'drawing-toolbar';

    for (const cat of TOOL_CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = `drawing-tool-btn cat-btn ${cat.id === this.activeCategory ? 'active' : ''}`;
      btn.title = cat.name;
      btn.innerHTML = `
        <span class="tool-btn-icon">${getIcon(cat.iconKey || cat.id)}</span>
        ${cat.tools.length > 1 ? '<span class="cat-expand-arrow"></span>' : ''}
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cat.tools.length === 1) {
          this.selectTool(cat.id, cat.tools[0].type);
          this.closeFlyout();
        } else {
          this.toggleFlyout(cat, btn);
        }
      });

      this.categoryBtns.set(cat.id, btn);
      bar.appendChild(btn);
    }

    const sep = document.createElement('div');
    sep.className = 'drawing-toolbar-sep';
    bar.appendChild(sep);

    // Drawing List Manager button
    const listBtn = document.createElement('button');
    listBtn.className = 'drawing-tool-btn list-btn';
    listBtn.title = 'Manage Drawings List';
    listBtn.innerHTML = getIcon('list');
    listBtn.addEventListener('click', () => {
      this.closeFlyout();
      if (this.onOpenDrawingList) this.onOpenDrawingList();
    });
    bar.appendChild(listBtn);

    // Delete selected button
    const delBtn = document.createElement('button');
    delBtn.className = 'drawing-tool-btn del-btn';
    delBtn.title = 'Delete Selected Drawing (Del / Backspace)';
    delBtn.innerHTML = getIcon('trash');
    delBtn.addEventListener('click', () => {
      this.closeFlyout();
      this.engine.deleteSelected();
    });
    bar.appendChild(delBtn);

    // Clear all button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'drawing-tool-btn clear-btn';
    clearBtn.title = 'Clear All Drawings';
    clearBtn.innerHTML = getIcon('clear');
    clearBtn.addEventListener('click', () => {
      this.closeFlyout();
      this.engine.clearAll();
    });
    bar.appendChild(clearBtn);

    this.container.appendChild(bar);

    // Flyout container
    this.flyoutEl = document.createElement('div');
    this.flyoutEl.className = 'drawing-flyout-menu';
    this.flyoutEl.style.display = 'none';
    this.container.appendChild(this.flyoutEl);
  }

  private toggleFlyout(category: ToolCategory, targetBtn: HTMLElement): void {
    if (this.openCategory === category.id) {
      this.closeFlyout();
      return;
    }
    this.openFlyout(category, targetBtn);
  }

  private openFlyout(category: ToolCategory, targetBtn: HTMLElement): void {
    if (!this.flyoutEl) return;
    this.openCategory = category.id;
    this.flyoutEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'drawing-flyout-header';
    header.innerHTML = `<span>${category.name}</span>`;
    this.flyoutEl.appendChild(header);

    const list = document.createElement('div');
    list.className = 'drawing-flyout-list';

    for (const tool of category.tools) {
      const item = document.createElement('button');
      item.className = `drawing-flyout-item ${tool.type === this.activeTool ? 'active' : ''}`;
      item.innerHTML = `
        <span class="flyout-icon">${getIcon(tool.iconKey || tool.type)}</span>
        <div class="flyout-info">
          <span class="flyout-name">${tool.name}</span>
          <span class="flyout-desc">${tool.description}</span>
        </div>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectTool(category.id, tool.type);
        this.closeFlyout();
      });

      list.appendChild(item);
    }

    this.flyoutEl.appendChild(list);

    // Position flyout next to button
    const btnRect = targetBtn.getBoundingClientRect();
    this.flyoutEl.style.top = `${Math.max(40, btnRect.top - 10)}px`;
    this.flyoutEl.style.left = '48px';
    this.flyoutEl.style.display = 'block';
  }

  private closeFlyout(): void {
    if (this.flyoutEl) {
      this.flyoutEl.style.display = 'none';
    }
    this.openCategory = null;
  }

  private selectTool(categoryId: string, tool: DrawingType): void {
    this.activeCategory = categoryId;
    this.activeTool = tool;
    this.engine.setTool(tool);
    this._syncButtonStates(categoryId);
  }

  /** Called externally when the engine changes tool (e.g. after drawing commit). */
  syncTool(tool: DrawingType): void {
    this.activeTool = tool;
    const categoryId = tool === 'cursor' ? 'cursor' : this.activeCategory;
    this._syncButtonStates(tool === 'cursor' ? 'cursor' : categoryId);
  }

  private _syncButtonStates(activeId: string): void {
    for (const [id, btn] of this.categoryBtns.entries()) {
      if (id === activeId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  }

  private wireGlobalEvents(): void {
    document.addEventListener('click', (e) => {
      if (this.openCategory && this.flyoutEl && !this.flyoutEl.contains(e.target as Node)) {
        this.closeFlyout();
      }
    });
  }
}
