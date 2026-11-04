import { getIcon } from './icons';

export interface ChartContextMenuOptions {
  container: HTMLElement;
  onResetChartView: () => void;
  onOpenChartSettings?: () => void;
  onRemoveAllDrawings?: () => void;
  onRemoveAllIndicators?: () => void;
  onHideAllDrawings?: () => void;
}

export interface MenuItemDefinition {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  isSeparator?: boolean;
  action?: () => void;
  danger?: boolean;
}

export class ChartContextMenu {
  private menuEl: HTMLElement | null = null;
  private isOpen = false;
  private readonly onContextMenuBound: (e: MouseEvent) => void;
  private readonly onGlobalPointerDownBound: (e: PointerEvent) => void;
  private readonly onGlobalKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onWheelBound: (e: WheelEvent) => void;

  constructor(private readonly options: ChartContextMenuOptions) {
    this.onContextMenuBound = (e: MouseEvent) => this.handleContextMenu(e);
    this.onGlobalPointerDownBound = (e: PointerEvent) => this.handleGlobalPointerDown(e);
    this.onGlobalKeyDownBound = (e: KeyboardEvent) => this.handleGlobalKeyDown(e);
    this.onWheelBound = () => this.close();

    this.init();
  }

  private init(): void {
    this.options.container.addEventListener('contextmenu', this.onContextMenuBound);
    this.options.container.addEventListener('wheel', this.onWheelBound, { passive: true });
    window.addEventListener('pointerdown', this.onGlobalPointerDownBound, true);
    window.addEventListener('keydown', this.onGlobalKeyDownBound);
  }

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();

    // Do not trigger if clicking on inputs or buttons
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button'))) {
      return;
    }

    this.open(e.clientX, e.clientY);
  }

  private handleGlobalPointerDown(e: PointerEvent): void {
    if (!this.isOpen || !this.menuEl) return;
    if (!this.menuEl.contains(e.target as Node)) {
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

  private getMenuItems(): MenuItemDefinition[] {
    const items: MenuItemDefinition[] = [
      {
        id: 'reset_view',
        label: 'Reset chart view',
        icon: getIcon('reset_view'),
        shortcut: 'Alt + R',
        action: () => {
          this.options.onResetChartView();
        },
      },
      {
        id: 'sep_1',
        label: '',
        isSeparator: true,
      },
    ];

    if (this.options.onOpenChartSettings) {
      items.push({
        id: 'chart_settings',
        label: 'Settings…',
        icon: getIcon('settings'),
        action: () => {
          this.options.onOpenChartSettings?.();
        },
      });
      items.push({
        id: 'sep_2',
        label: '',
        isSeparator: true,
      });
    }

    if (this.options.onRemoveAllDrawings) {
      items.push({
        id: 'remove_drawings',
        label: 'Remove drawings',
        icon: getIcon('trash'),
        action: () => {
          this.options.onRemoveAllDrawings?.();
        },
      });
    }

    if (this.options.onRemoveAllIndicators) {
      items.push({
        id: 'remove_indicators',
        label: 'Remove indicators',
        icon: getIcon('indicators'),
        action: () => {
          this.options.onRemoveAllIndicators?.();
        },
      });
    }

    return items;
  }

  public open(clientX: number, clientY: number): void {
    this.close();

    const menu = document.createElement('div');
    menu.className = 'tv-chart-context-menu';
    menu.setAttribute('role', 'menu');

    const items = this.getMenuItems();
    for (const item of items) {
      if (item.isSeparator) {
        const sep = document.createElement('div');
        sep.className = 'tv-context-menu-sep';
        menu.appendChild(sep);
        continue;
      }

      const row = document.createElement('div');
      row.className = `tv-context-menu-item ${item.danger ? 'danger' : ''}`;
      row.setAttribute('role', 'menuitem');
      row.setAttribute('tabindex', '0');

      const leftWrap = document.createElement('div');
      leftWrap.className = 'tv-context-item-left';

      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'tv-context-item-icon';
        iconSpan.innerHTML = item.icon;
        leftWrap.appendChild(iconSpan);
      }

      const labelSpan = document.createElement('span');
      labelSpan.className = 'tv-context-item-label';
      labelSpan.textContent = item.label;
      leftWrap.appendChild(labelSpan);

      row.appendChild(leftWrap);

      if (item.shortcut) {
        const shortcutKbd = document.createElement('kbd');
        shortcutKbd.className = 'tv-context-shortcut';
        shortcutKbd.textContent = item.shortcut;
        row.appendChild(shortcutKbd);
      }

      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.close();
        item.action?.();
      });

      menu.appendChild(row);
    }

    document.body.appendChild(menu);
    this.menuEl = menu;
    this.isOpen = true;

    // Viewport boundary clamping
    const rect = menu.getBoundingClientRect();
    const menuWidth = rect.width || 210;
    const menuHeight = rect.height || 180;
    const padding = 8;

    let posX = clientX;
    let posY = clientY;

    if (posX + menuWidth > window.innerWidth - padding) {
      posX = Math.max(padding, clientX - menuWidth);
    }
    if (posY + menuHeight > window.innerHeight - padding) {
      posY = Math.max(padding, clientY - menuHeight);
    }

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
  }

  public close(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    this.isOpen = false;
  }

  public destroy(): void {
    this.close();
    this.options.container.removeEventListener('contextmenu', this.onContextMenuBound);
    this.options.container.removeEventListener('wheel', this.onWheelBound);
    window.removeEventListener('pointerdown', this.onGlobalPointerDownBound, true);
    window.removeEventListener('keydown', this.onGlobalKeyDownBound);
  }
}

