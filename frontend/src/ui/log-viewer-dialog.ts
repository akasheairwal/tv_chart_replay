/**
 * Log Viewer Dialog UI — inspect structured runtime logs with TV styling and SVG icons.
 */

import type { PythonBridge } from '../bridge/python-bridge';
import { getIcon } from './icons';

export interface LogEntry {
  timestamp: number;
  formatted_time: string;
  level: 'INFO' | 'WARN' | 'WARNING' | 'ERROR';
  name: string;
  message: string;
}

export class LogViewerDialog {
  private readonly overlay: HTMLElement;
  private minLevel: 'INFO' | 'WARN' | 'ERROR' = 'INFO';
  private searchQuery = '';
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    container: HTMLElement,
    private readonly bridge: PythonBridge | null,
  ) {
    this.overlay = this.buildOverlay();
    container.appendChild(this.overlay);
  }

  private buildOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'session-overlay';
    overlay.id = 'log-viewer-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'System Log Viewer');
    overlay.innerHTML = `
      <div class="session-modal tv-modal" style="width: min(840px, 95vw); height: 75vh;">
        <div class="session-modal-header">
          <div class="session-modal-title">
            <span class="modal-title-icon">${getIcon('logs')}</span>
            <span>System Log Viewer</span>
          </div>
          <div class="session-tab-row">
            <select id="log-level-filter" class="session-tab" style="padding: 3px 8px;">
              <option value="INFO">INFO & above</option>
              <option value="WARN">WARN & above</option>
              <option value="ERROR">ERROR only</option>
            </select>
            <button class="session-tab" id="log-copy-btn">${getIcon('list')} <span>Copy</span></button>
            <button class="session-tab" id="log-clear-btn">${getIcon('trash')} <span>Clear</span></button>
          </div>
          <button class="session-modal-close" id="log-close-btn" aria-label="Close">${getIcon('close')}</button>
        </div>
        <div class="session-modal-body" style="display: flex; flex-direction: column; gap: 8px;">
          <div class="session-search-row">
            <span class="session-search-icon">${getIcon('search')}</span>
            <input class="session-search-input" id="log-search-input" placeholder="Search log entries…" type="search" />
          </div>
          <div class="log-entries-container" id="log-entries" style="flex: 1; overflow-y: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-word;">
            <p class="session-empty">Loading logs…</p>
          </div>
        </div>
        <div class="session-modal-footer" id="log-status-bar">Showing live system records</div>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hide();
    });

    overlay.querySelector('#log-close-btn')!.addEventListener('click', () => this.hide());

    const levelSelect = overlay.querySelector<HTMLSelectElement>('#log-level-filter')!;
    levelSelect.addEventListener('change', () => {
      this.minLevel = levelSelect.value as 'INFO' | 'WARN' | 'ERROR';
      void this.refresh();
    });

    const searchInput = overlay.querySelector<HTMLInputElement>('#log-search-input')!;
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.toLowerCase();
      void this.refresh();
    });

    overlay.querySelector('#log-clear-btn')!.addEventListener('click', () => void this.handleClear());
    overlay.querySelector('#log-copy-btn')!.addEventListener('click', () => this.handleCopy());

    return overlay;
  }

  async show(): Promise<void> {
    this.overlay.classList.add('visible');
    await this.refresh();
    this.startAutoRefresh();
  }

  hide(): void {
    this.overlay.classList.remove('visible');
    this.stopAutoRefresh();
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.autoRefreshTimer = setInterval(() => void this.refresh(), 3000);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  private async refresh(): Promise<void> {
    if (!this.bridge) return;

    try {
      const res = await this.bridge.callJson<{ ok: boolean; data?: LogEntry[] }>('getLogs', {
        min_level: this.minLevel,
      });

      if (res.ok && Array.isArray(res.data)) {
        this.renderLogs(res.data);
      }
    } catch {
      /* ignore */
    }
  }

  private renderLogs(entries: LogEntry[]): void {
    const container = this.overlay.querySelector('#log-entries')!;
    const filtered = entries.filter((e) => {
      if (!this.searchQuery) return true;
      return (
        e.message.toLowerCase().includes(this.searchQuery) ||
        e.name.toLowerCase().includes(this.searchQuery) ||
        e.formatted_time.toLowerCase().includes(this.searchQuery)
      );
    });

    if (filtered.length === 0) {
      container.innerHTML = '<p class="session-empty">No log records match current filters.</p>';
      return;
    }

    container.innerHTML = filtered
      .map((entry) => {
        const lvl = entry.level.toUpperCase();
        const color =
          lvl === 'ERROR' ? '#f23645' : lvl === 'WARN' || lvl === 'WARNING' ? '#ff9800' : '#787b86';
        return `<div style="margin-bottom: 3px; line-height: 1.4;"><span style="color: #787b86;">[${entry.formatted_time}]</span> <span style="color: ${color}; font-weight: bold;">[${lvl}]</span> <span style="color: #2962ff;">${entry.name}:</span> ${this.escapeHtml(entry.message)}</div>`;
      })
      .join('');

    container.scrollTop = container.scrollHeight;
    const bar = this.overlay.querySelector('#log-status-bar')!;
    bar.textContent = `Showing ${filtered.length} log records`;
  }

  private handleCopy(): void {
    const container = this.overlay.querySelector('#log-entries')!;
    const text = container.textContent || '';
    void navigator.clipboard.writeText(text);
    const bar = this.overlay.querySelector('#log-status-bar')!;
    bar.textContent = 'Copied to clipboard!';
    setTimeout(() => {
      bar.textContent = 'Showing live system records';
    }, 1500);
  }

  private async handleClear(): Promise<void> {
    if (!this.bridge) return;
    try {
      await this.bridge.callJson('clearLogs', {});
      void this.refresh();
    } catch {
      /* ignore */
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
