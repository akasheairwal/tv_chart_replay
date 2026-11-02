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
  private categoryActiveTool = new Map<string, DrawingType>();
  private flyoutEl: HTMLElement | null = null;
  private openCategory: string | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly engine: DrawingEngine,
    private readonly onOpenDrawingList?: () => void,
  ) {
    for (const cat of TOOL_CATEGORIES) {
      this.categoryActiveTool.set(cat.id, cat.tools[0]?.type || (cat.id as DrawingType));
    }
    this.render();
    this.wireGlobalEvents();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'drawing-toolbar-wrapper';

    const bar = document.createElement('div');
    bar.className = 'drawing-toolbar';

    for (const cat of TOOL_CATEGORIES) {
      const initialTool = this.categoryActiveTool.get(cat.id) || cat.tools[0]?.type || (cat.id as DrawingType);
      const initialToolDef = cat.tools.find((t) => t.type === initialTool);
      const iconKey = initialToolDef?.iconKey || cat.iconKey || cat.id;

      const btn = document.createElement('button');
      btn.className = `drawing-tool-btn cat-btn ${cat.id === this.activeCategory ? 'active' : ''}`;
      btn.title = initialToolDef?.name || cat.name;
      btn.innerHTML = `
        <span class="tool-btn-icon">${getIcon(iconKey)}</span>
        ${cat.tools.length > 1 ? '<span class="cat-expand-arrow"></span>' : ''}
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isArrow = !!(e.target as HTMLElement).closest?.('.cat-expand-arrow');
        if (cat.tools.length === 1) {
          this.selectTool(cat.id, cat.tools[0].type);
          this.closeFlyout();
        } else if (isArrow) {
          this.toggleFlyout(cat, btn);
        } else {
          const currentTool = this.categoryActiveTool.get(cat.id) || cat.tools[0].type;
          if (this.activeCategory === cat.id && this.activeTool === currentTool) {
            this.toggleFlyout(cat, btn);
          } else {
            this.selectTool(cat.id, currentTool);
            this.closeFlyout();
          }
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
    this.categoryActiveTool.set(categoryId, tool);
    this.engine.setTool(tool);
    this._updateCategoryButton(categoryId, tool);
    this._syncButtonStates(categoryId);
  }

  /** Called externally when the engine changes tool (e.g. after drawing commit). */
  syncTool(tool: DrawingType): void {
    this.activeTool = tool;
    const cat = this._findCategoryForTool(tool);
    const categoryId = cat ? cat.id : (tool === 'cursor' ? 'cursor' : this.activeCategory);
    if (cat) {
      this.activeCategory = cat.id;
      this.categoryActiveTool.set(cat.id, tool);
      this._updateCategoryButton(cat.id, tool);
    }
    this._syncButtonStates(tool === 'cursor' ? 'cursor' : categoryId);
  }

  private _findCategoryForTool(tool: DrawingType): ToolCategory | undefined {
    return TOOL_CATEGORIES.find((c) => c.tools.some((t) => t.type === tool));
  }

  private _updateCategoryButton(categoryId: string, tool: DrawingType): void {
    const btn = this.categoryBtns.get(categoryId);
    if (!btn) return;
    const cat = TOOL_CATEGORIES.find((c) => c.id === categoryId);
    const toolDef = cat?.tools.find((t) => t.type === tool);
    const iconKey = toolDef?.iconKey || tool;
    const iconSpan = btn.querySelector?.('.tool-btn-icon');
    if (iconSpan) {
      iconSpan.innerHTML = getIcon(iconKey);
    }
    if (toolDef) {
      btn.title = toolDef.name;
    }
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
