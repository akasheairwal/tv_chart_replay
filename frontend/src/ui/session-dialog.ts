/**
 * Session Dialog UI — Save, Open, and Autosave-Recovery panels for
 * managing replay sessions with TradingView dark styling.
 */

import type { SessionContext, SessionManager } from '../sessions/session-manager';
import type { SessionDefinition, SessionSummary } from '../sessions/session-types';
import { getIcon } from './icons';

export class SessionDialog {
  private readonly overlay: HTMLElement;
  private summaries: SessionSummary[] = [];

  constructor(
    container: HTMLElement,
    private readonly sessionManager: SessionManager,
    private readonly ctx: () => SessionContext,
    private readonly onSessionLoaded: (session: SessionDefinition) => void,
  ) {
    this.overlay = this.buildOverlay();
    container.appendChild(this.overlay);
  }

  private buildOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'session-overlay';
    overlay.id = 'session-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Session Manager');
    overlay.innerHTML = `
      <div class="session-modal tv-modal">
        <div class="session-modal-header">
          <div class="session-modal-title">
            <span class="modal-title-icon">${getIcon('sessions')}</span>
            <span>Sessions</span>
          </div>
          <div class="session-tab-row">
            <button class="session-tab active" id="tab-open" data-tab="open">Open</button>
            <button class="session-tab" id="tab-save" data-tab="save">Save</button>
          </div>
          <button class="session-modal-close" id="session-close-btn" aria-label="Close">${getIcon('close')}</button>
        </div>
        <div class="session-modal-body">

          <!-- Open tab -->
          <div class="session-tab-content active" id="content-open">
            <div class="session-search-row">
              <span class="session-search-icon">${getIcon('search')}</span>
              <input class="session-search-input" id="session-search" placeholder="Search sessions…" type="search" />
            </div>
            <div class="session-list" id="session-list">
              <p class="session-empty">No saved sessions yet.</p>
            </div>
          </div>

          <!-- Save tab -->
          <div class="session-tab-content" id="content-save">
            <div class="session-save-form">
              <label class="session-form-label" for="session-name-input">Session name</label>
              <input class="session-name-input" id="session-name-input" type="text" placeholder="e.g. EURUSD Breakout Study" maxlength="80" />
              <div class="session-save-preview" id="session-save-preview"></div>
              <button class="session-save-btn" id="session-save-btn">${getIcon('save')} <span>Save Session</span></button>
            </div>
          </div>

        </div>
        <div class="session-modal-footer" id="session-status-bar"></div>
      </div>
    `;

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hide();
    });

    overlay.querySelector('#session-close-btn')!.addEventListener('click', () => this.hide());

    // Tab switching
    overlay.querySelectorAll('.session-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = (tab as HTMLElement).dataset.tab as 'open' | 'save';
        if (target) this.switchTab(target);
      });
    });

    // Save button
    overlay.querySelector('#session-save-btn')!.addEventListener('click', () => void this.handleSave());

    // Name input → refresh preview
    overlay.querySelector('#session-name-input')!.addEventListener('input', () => this.updateSavePreview());

    // Search filter
    overlay.querySelector('#session-search')!.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderList(
        this.summaries.filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.symbol.toLowerCase().includes(query) ||
            s.timeframe.toLowerCase().includes(query),
        ),
      );
    });

    // Keyboard shortcut (Escape)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) this.hide();
    });

    return overlay;
  }

  show(tab: 'open' | 'save' = 'open'): void {
    this.overlay.classList.add('visible');
    this.switchTab(tab);
    void this.refreshList();
    if (tab === 'save') {
      this.updateSavePreview();
    }
  }

  hide(): void {
    this.overlay.classList.remove('visible');
  }

  isVisible(): boolean {
    return this.overlay.classList.contains('visible');
  }

  private switchTab(tab: 'open' | 'save'): void {
    this.overlay.querySelectorAll('.session-tab').forEach((t) => {
      t.classList.toggle('active', (t as HTMLElement).dataset.tab === tab);
    });
    this.overlay.querySelectorAll('.session-tab-content').forEach((c) => {
      c.classList.toggle('active', c.id === `content-${tab}`);
    });
    if (tab === 'save') {
      this.updateSavePreview();
    }
  }

  private async refreshList(): Promise<void> {
    this.summaries = await this.sessionManager.listSessions();
    this.renderList(this.summaries);
  }

  private renderList(summaries: SessionSummary[]): void {
    const list = this.overlay.querySelector('#session-list')!;
    if (summaries.length === 0) {
      list.innerHTML = '<p class="session-empty">No saved sessions yet.</p>';
      return;
    }

    list.innerHTML = summaries
      .map((s) => {
        const date = new Date(s.updated_at * 1000).toLocaleString();
        const indBadge =
          s.indicator_count > 0
            ? `<span class="session-badge">${s.indicator_count} inds</span>`
            : '';
        const drwBadge =
          s.drawing_count > 0
            ? `<span class="session-badge">${s.drawing_count} drws</span>`
            : '';
        return `
        <div class="session-item" data-id="${s.id}">
          <div class="session-item-info">
            <span class="session-item-name">${s.name}</span>
            <span class="session-item-meta">
              <span class="session-sym-badge">${s.symbol} · ${s.timeframe}</span>
              ${indBadge}${drwBadge}
              <span class="session-item-date">${date}</span>
            </span>
          </div>
          <div class="session-item-actions">
            <button class="session-load-btn" data-id="${s.id}" title="Load session">${getIcon('play')} <span>Load</span></button>
            <button class="session-delete-btn" data-id="${s.id}" title="Delete">${getIcon('trash')}</button>
          </div>
        </div>
      `;
      })
      .join('');

    list.querySelectorAll('.session-load-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        void this.handleLoad(id);
      });
    });

    list.querySelectorAll('.session-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        void this.handleDelete(id);
      });
    });
  }

  private updateSavePreview(): void {
    const ctx = this.ctx();
    const preview = this.overlay.querySelector('#session-save-preview')!;
    const replayState = ctx.replayController.state;
    const indicators = ctx.indicatorManager.getActive?.() ?? [];
    const drawings = ctx.drawingEngine?.getDrawings() ?? [];
    const nameInput = this.overlay.querySelector<HTMLInputElement>('#session-name-input')!;
    if (!nameInput.value) {
      nameInput.value = `${ctx.symbol} ${ctx.timeframe} — ${new Date().toLocaleString()}`;
    }

    preview.innerHTML = `
      <div class="session-preview-row"><strong>Symbol:</strong> ${ctx.symbol} · ${ctx.timeframe}</div>
      <div class="session-preview-row"><strong>Candle:</strong> ${replayState?.current_index ?? 0} / ${replayState?.end_index ?? 0}</div>
      <div class="session-preview-row"><strong>Speed:</strong> ${replayState?.speed ?? 1.0}x</div>
      <div class="session-preview-row"><strong>Indicators:</strong> ${indicators.length}</div>
      <div class="session-preview-row"><strong>Drawings:</strong> ${drawings.length}</div>
    `;
  }

  private async handleSave(): Promise<void> {
    const nameInput = this.overlay.querySelector<HTMLInputElement>('#session-name-input')!;
    const name = nameInput.value.trim() || `Session ${new Date().toLocaleString()}`;
    const ctx = this.ctx();
    this.setStatus('Saving…', 'info');
    const id = await this.sessionManager.saveSession(ctx, name);
    if (id) {
      this.setStatus(`Saved: "${name}"`, 'success');
      nameInput.value = '';
      await this.refreshList();
      setTimeout(() => this.switchTab('open'), 800);
    } else {
      this.setStatus('Save failed. Bridge unavailable.', 'error');
    }
  }

  private async handleLoad(id: string): Promise<void> {
    this.setStatus('Loading session…', 'info');
    const session = await this.sessionManager.loadSession(id);
    if (!session) {
      this.setStatus('Failed to load session.', 'error');
      return;
    }

    if (session.dataset_check && !session.dataset_check.match) {
      const warn = session.dataset_check.message ?? 'Dataset version mismatch';
      this.setStatus(`Warning: ${warn}`, 'warn');
    } else {
      this.setStatus(`Loaded: "${session.name}"`, 'success');
    }

    this.onSessionLoaded(session);
    setTimeout(() => this.hide(), 500);
  }

  private async handleDelete(id: string): Promise<void> {
    const confirmed = window.confirm('Delete this session? This cannot be undone.');
    if (!confirmed) return;
    const ok = await this.sessionManager.deleteSession(id);
    if (ok) {
      await this.refreshList();
      this.setStatus('Session deleted.', 'info');
    } else {
      this.setStatus('Delete failed.', 'error');
    }
  }

  /** Show autosave recovery banner prompting user to restore previous autosave. */
  showAutosaveBanner(session: SessionDefinition, onRestore: () => void): void {
    const banner = document.createElement('div');
    banner.className = 'session-autosave-banner';
    banner.id = 'autosave-banner';
    const date = new Date((session.updated_at ?? 0) * 1000).toLocaleString();
    banner.innerHTML = `
      <span>Unsaved session found for <strong>${session.symbol} ${session.timeframe}</strong> (${date})</span>
      <button class="session-autosave-restore" id="autosave-restore-btn">Restore</button>
      <button class="session-autosave-dismiss" id="autosave-dismiss-btn">Dismiss</button>
    `;
    banner.querySelector('#autosave-restore-btn')!.addEventListener('click', () => {
      onRestore();
      banner.remove();
    });
    banner.querySelector('#autosave-dismiss-btn')!.addEventListener('click', () => banner.remove());
    document.body.prepend(banner);
  }

  private setStatus(msg: string, type: 'info' | 'success' | 'error' | 'warn'): void {
    const bar = this.overlay.querySelector('#session-status-bar')!;
    bar.className = `session-modal-footer status-${type}`;
    bar.textContent = msg;
  }
}
