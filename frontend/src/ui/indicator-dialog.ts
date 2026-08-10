import type { IndicatorManager } from '../indicators/indicator-manager';
import type { ActiveIndicator } from '../indicators/indicator-types';
import { getIcon } from './icons';

export class IndicatorDialog {
  private overlayEl!: HTMLElement;
  private modalEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private categoryFilter = 'all';
  private indicatorListEl!: HTMLElement;
  private activeListEl!: HTMLElement;

  constructor(
    private readonly container: HTMLElement,
    private readonly manager: IndicatorManager,
  ) {
    this.render();
  }

  show(): void {
    this.overlayEl.style.display = 'flex';
    this.refreshCatalogList();
    this.refreshActiveList(this.manager.getActive());
    this.searchInput.focus();
  }

  hide(): void {
    this.overlayEl.style.display = 'none';
  }

  updateActive(active: ActiveIndicator[]): void {
    this.refreshActiveList(active);
  }

  private render(): void {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'modal-overlay';
    this.overlayEl.style.display = 'none';

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'indicator-dialog modal-card tv-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'modal-title';
    titleWrap.innerHTML = `<span class="modal-title-icon">${getIcon('indicators')}</span><h3>Technical Indicators</h3>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-btn';
    closeBtn.innerHTML = getIcon('close');
    closeBtn.addEventListener('click', () => this.hide());

    header.append(titleWrap, closeBtn);

    // Search bar
    const searchWrap = document.createElement('div');
    searchWrap.className = 'indicator-search-wrap';
    searchWrap.innerHTML = `<span class="search-icon-badge">${getIcon('search')}</span>`;
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'indicator-search-input';
    this.searchInput.placeholder = 'Search indicators (e.g. SMA, RSI, MACD, Bollinger)…';
    this.searchInput.addEventListener('input', () => this.refreshCatalogList());
    searchWrap.appendChild(this.searchInput);

    // Categories
    const categoriesWrap = document.createElement('div');
    categoriesWrap.className = 'indicator-categories';
    const categories = ['all', 'trend', 'momentum', 'volatility', 'volume'];

    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = `category-btn ${cat === 'all' ? 'active' : ''}`;
      btn.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      btn.addEventListener('click', () => {
        this.categoryFilter = cat;
        categoriesWrap
          .querySelectorAll('.category-btn')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.refreshCatalogList();
      });
      categoriesWrap.appendChild(btn);
    });

    // Content: Catalog and Active side-by-side
    const body = document.createElement('div');
    body.className = 'indicator-dialog-body';

    const catalogSection = document.createElement('div');
    catalogSection.className = 'indicator-catalog-section';
    const catalogTitle = document.createElement('div');
    catalogTitle.className = 'section-title';
    catalogTitle.textContent = 'AVAILABLE INDICATORS';
    this.indicatorListEl = document.createElement('div');
    this.indicatorListEl.className = 'indicator-catalog-list';
    catalogSection.append(catalogTitle, this.indicatorListEl);

    const activeSection = document.createElement('div');
    activeSection.className = 'indicator-active-section';
    const activeTitle = document.createElement('div');
    activeTitle.className = 'section-title';
    activeTitle.textContent = 'ACTIVE ON CHART';
    this.activeListEl = document.createElement('div');
    this.activeListEl.className = 'indicator-active-list';
    activeSection.append(activeTitle, this.activeListEl);

    body.append(catalogSection, activeSection);

    this.modalEl.append(header, searchWrap, categoriesWrap, body);
    this.overlayEl.appendChild(this.modalEl);
    this.container.appendChild(this.overlayEl);

    // Close on clicking backdrop
    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) this.hide();
    });
  }

  private refreshCatalogList(): void {
    this.indicatorListEl.innerHTML = '';
    const query = this.searchInput.value.toLowerCase().trim();
    const catalog = this.manager.getCatalog();

    const filtered = catalog.filter((ind) => {
      const matchesCategory =
        this.categoryFilter === 'all' || ind.category === this.categoryFilter;
      const matchesSearch =
        !query ||
        ind.name.toLowerCase().includes(query) ||
        ind.display_name.toLowerCase().includes(query) ||
        ind.category.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'indicator-empty';
      empty.textContent = 'No matching indicators found';
      this.indicatorListEl.appendChild(empty);
      return;
    }

    filtered.forEach((ind) => {
      const item = document.createElement('div');
      item.className = 'indicator-item';

      const info = document.createElement('div');
      info.className = 'indicator-item-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'indicator-item-name';
      nameEl.textContent = ind.display_name;
      const catEl = document.createElement('span');
      catEl.className = 'indicator-item-cat';
      catEl.textContent = `${ind.category.toUpperCase()} · ${ind.overlay ? 'Overlay' : 'Sub-pane'}`;
      info.append(nameEl, catEl);

      const addBtn = document.createElement('button');
      addBtn.className = 'indicator-add-btn';
      addBtn.innerHTML = `${getIcon('plus')} <span>Add</span>`;
      addBtn.addEventListener('click', () => {
        void this.manager.addIndicator(ind.name);
      });

      item.append(info, addBtn);
      this.indicatorListEl.appendChild(item);
    });
  }

  private refreshActiveList(active: ActiveIndicator[]): void {
    this.activeListEl.innerHTML = '';
    if (active.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'indicator-empty';
      empty.textContent = 'No indicators active on chart';
      this.activeListEl.appendChild(empty);
      return;
    }

    active.forEach((ind) => {
      const item = document.createElement('div');
      item.className = 'active-indicator-item';

      const info = document.createElement('div');
      info.className = 'active-indicator-title';
      const paramStr = Object.entries(ind.params)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      info.textContent = `${ind.display_name} ${paramStr ? `(${paramStr})` : ''}`;

      const actions = document.createElement('div');
      actions.className = 'active-indicator-actions';

      const eyeBtn = document.createElement('button');
      eyeBtn.className = 'active-action-btn';
      eyeBtn.innerHTML = ind.visible ? getIcon('eye') : getIcon('eye_off');
      eyeBtn.title = ind.visible ? 'Hide Indicator' : 'Show Indicator';
      eyeBtn.addEventListener('click', () => void this.manager.toggleVisibility(ind.id));

      const delBtn = document.createElement('button');
      delBtn.className = 'active-action-btn delete-btn';
      delBtn.innerHTML = getIcon('close');
      delBtn.title = 'Remove Indicator';
      delBtn.addEventListener('click', () => this.manager.removeIndicator(ind.id));

      actions.append(eyeBtn, delBtn);
      item.append(info, actions);
      this.activeListEl.appendChild(item);
    });
  }
}
