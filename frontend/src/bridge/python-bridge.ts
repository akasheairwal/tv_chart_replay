/**
 * Minimal dual-transport bridge wrapper exposing the Python bridge surface.
 *
 * - Desktop Shell Mode (PySide6 / QWebChannel):
 *   Locates window.qt.webChannelTransport, loads qwebchannel.js, wires
 *   signals/slots via in-process memory IPC.
 *
 * - Cloud Mode (FastAPI / WebSockets / Render.com):
 *   Uses HTTP POST for command dispatch and WebSockets for real-time
 *   event streaming when VITE_BACKEND_URL is configured.
 *   Includes smart keep-alive wake-up pings every 14 minutes (up to 4 hours of inactivity)
 *   to keep free-tier containers (like Render.com) from spinning down while avoiding
 *   unnecessary quota usage.
 *
 * - Browser Mode (Fallback):
 *   When neither Qt nor a cloud backend is available, degrades gracefully
 *   so the UI runs client-side synthetic simulations.
 */

import type { BridgeConnectionInfo, EventListener, WatchlistItemBridge } from './bridge-types';

const QWEBCHANNEL_SCRIPT_URL = 'qrc:///qtwebchannel/qwebchannel.js';

/** Default keep-alive ping interval (14 minutes, safely under Render's 15m idle limit). */
export const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 14 * 60 * 1000;

/** Default maximum inactive duration before allowing backend to sleep (4 hours). */
export const DEFAULT_MAX_INACTIVITY_MS = 4 * 60 * 60 * 1000;

type QWebChannelCallback = (channel: { objects: Record<string, unknown> }) => void;

declare global {
  interface Window {
    QWebChannel?: new (transport: unknown, callback: QWebChannelCallback) => void;
    qt?: { webChannelTransport?: unknown };
    __BACKEND_URL__?: string;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export interface PythonBridgeOptions {
  backendUrl?: string;
  keepAliveIntervalMs?: number;
  maxInactivityMs?: number;
  enableKeepAlive?: boolean;
}

export class PythonBridge {
  private transportReady: Promise<boolean> | null = null;
  private objects: Record<string, unknown> = {};
  private readonly listeners = new Map<string, Set<EventListener>>();
  connected = false;
  version = '';
  mode: 'qt' | 'cloud' | 'browser' = 'browser';

  private backendUrl = '';
  private ws: WebSocket | null = null;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Keep-alive settings
  private readonly keepAliveIntervalMs: number;
  private readonly maxInactivityMs: number;
  private readonly enableKeepAlive: boolean;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private lastUserActivityTime = Date.now();
  private activityListenerBound = false;
  private isSleepingDueToInactivity = false;

  constructor(options?: PythonBridgeOptions) {
    this.keepAliveIntervalMs = options?.keepAliveIntervalMs ?? DEFAULT_KEEP_ALIVE_INTERVAL_MS;
    this.maxInactivityMs = options?.maxInactivityMs ?? DEFAULT_MAX_INACTIVITY_MS;
    this.enableKeepAlive = options?.enableKeepAlive ?? true;

    if (options?.backendUrl) {
      this.backendUrl = options.backendUrl.replace(/\/+$/, '');
    } else if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) {
      this.backendUrl = String((import.meta as any).env.VITE_BACKEND_URL).replace(/\/+$/, '');
    } else if (typeof window !== 'undefined' && window.__BACKEND_URL__) {
      this.backendUrl = String(window.__BACKEND_URL__).replace(/\/+$/, '');
    }
  }

  hasBackendUrl(): boolean {
    return Boolean(this.backendUrl);
  }

  getBackendUrl(): string {
    return this.backendUrl;
  }

  /** Establish the connection (idempotent). */
  async connect(): Promise<boolean> {
    if (this.transportReady === null) {
      this.transportReady = this.doConnect();
    }
    return this.transportReady;
  }

  private async doConnect(): Promise<boolean> {
    // 1. Desktop Mode: Check for native Qt WebChannel transport
    if (typeof window !== 'undefined' && window.qt?.webChannelTransport) {
      try {
        if (!window.QWebChannel) {
          await loadScript(QWEBCHANNEL_SCRIPT_URL);
        }
        if (window.QWebChannel) {
          await new Promise<void>((resolve, reject) => {
            try {
              const QWebChannel = window.QWebChannel as new (
                transport: unknown,
                callback: QWebChannelCallback,
              ) => void;
              new QWebChannel(window.qt!.webChannelTransport, (channel) => {
                this.objects = channel.objects ?? {};
                const bridge = this.objects.bridge as Record<string, unknown> | undefined;
                if (!bridge) {
                  reject(new Error('Python "bridge" object is not registered on the channel'));
                  return;
                }
                const eventEmitted = bridge.eventEmitted as
                  | { connect?: (cb: (name: string, payloadJson: string) => void) => void }
                  | undefined;
                if (typeof eventEmitted?.connect === 'function') {
                  eventEmitted.connect((name, payloadJson) => {
                    let payload: unknown = payloadJson;
                    try {
                      payload = JSON.parse(payloadJson);
                    } catch {
                      /* keep raw string */
                    }
                    this.dispatchEvent(name, payload);
                  });
                }
                this.connected = true;
                this.mode = 'qt';
                resolve();
              });
            } catch (error) {
              reject(error as Error);
            }
          });

          // Read version directly from Qt bridge
          const versionFn = (this.objects.bridge as Record<string, unknown>).systemVersion as
            | ((cb: (value: unknown) => void) => void)
            | undefined;
          if (typeof versionFn === 'function') {
            versionFn((value) => (this.version = String(value ?? '')));
          }
          return true;
        }
      } catch (error) {
        console.warn('[bridge] Qt desktop connection failed, testing cloud fallback:', error);
      }
    }

    // 2. Cloud Mode: Check for configured HTTP/WebSocket backend (e.g. Render.com)
    if (this.backendUrl && typeof fetch !== 'undefined') {
      try {
        const res = await fetch(`${this.backendUrl}/api/systemVersion`, {
          method: 'GET',
          headers: { Accept: 'text/plain, application/json' },
        });
        if (res.ok) {
          this.version = (await res.text()).trim();
          this.connected = true;
          this.mode = 'cloud';
          this.setupWebSocket();
          this.startKeepAlive();
          return true;
        }
      } catch (err) {
        console.warn('[bridge] Cloud backend connection failed:', err);
      }
    }

    // 3. Fallback: Browser mode (offline synthetic simulation)
    this.mode = 'browser';
    this.connected = false;
    return false;
  }

  private setupWebSocket(): void {
    if (typeof WebSocket === 'undefined' || !this.backendUrl) return;
    try {
      const wsUrl = this.backendUrl.replace(/^http/, 'ws') + '/ws';
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg && typeof msg === 'object' && 'event' in msg) {
            this.dispatchEvent(msg.event, msg.data);
          }
        } catch {
          // ignore non-json messages
        }
      };

      this.ws.onclose = () => {
        if (this.connected && this.mode === 'cloud') {
          if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = setTimeout(() => this.setupWebSocket(), 3000);
        }
      };

      this.ws.onerror = (err) => {
        console.debug('[bridge] WebSocket error:', err);
      };
    } catch (err) {
      console.warn('[bridge] Could not establish WebSocket:', err);
    }
  }

  // -- Keep-Alive & Wake-up Management --------------------------------

  /** Start 14-minute interval keep-alive ping loop for cloud hosting. */
  startKeepAlive(): void {
    if (!this.enableKeepAlive || !this.backendUrl || this.keepAliveTimer) return;
    this.bindActivityListeners();
    this.lastUserActivityTime = Date.now();
    this.isSleepingDueToInactivity = false;

    this.keepAliveTimer = setInterval(() => {
      void this.performKeepAliveCheck();
    }, this.keepAliveIntervalMs);
  }

  /** Stop keep-alive ping loop. */
  stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /** Execute a periodic keep-alive check. */
  async performKeepAliveCheck(): Promise<boolean> {
    if (this.mode !== 'cloud' || !this.backendUrl) return false;

    const idleTimeMs = Date.now() - this.lastUserActivityTime;
    if (idleTimeMs <= this.maxInactivityMs) {
      // Inactive for under 4 hours -> send wake-up ping to keep Render warm
      const idleMin = Math.round(idleTimeMs / 60000);
      const maxMin = Math.round(this.maxInactivityMs / 60000);
      console.debug(`[bridge] Sending keep-alive ping to backend (idle: ${idleMin}m / ${maxMin}m)`);
      return await this.sendWakeUpPing();
    } else {
      // Inactive for >= 4 hours -> stop pinging to conserve free tier hours
      if (!this.isSleepingDueToInactivity) {
        this.isSleepingDueToInactivity = true;
        console.info('[bridge] Max inactive time (4 hours) reached. Letting backend sleep to conserve free quota.');
        this.stopKeepAlive();
      }
      return false;
    }
  }

  /** Lightweight GET /health ping. */
  async sendWakeUpPing(): Promise<boolean> {
    if (!this.backendUrl || typeof fetch === 'undefined') return false;
    try {
      const res = await fetch(`${this.backendUrl}/health`, {
        method: 'GET',
        cache: 'no-store',
      });
      return res.ok;
    } catch (err) {
      console.debug('[bridge] Keep-alive ping failed (backend may be spinning up):', err);
      return false;
    }
  }

  /** Record user interaction and auto-wake the backend if it was sleeping. */
  recordUserActivity(): void {
    const wasSleeping = this.isSleepingDueToInactivity;
    this.lastUserActivityTime = Date.now();
    this.isSleepingDueToInactivity = false;

    // If backend was allowed to sleep after 4 hours of inactivity, wake it up immediately
    if (wasSleeping && this.mode === 'cloud' && this.backendUrl) {
      console.info('[bridge] User returned after inactivity. Waking up backend...');
      void this.sendWakeUpPing();
      this.startKeepAlive();
    }
  }

  private bindActivityListeners(): void {
    if (typeof window === 'undefined' || this.activityListenerBound) return;
    this.activityListenerBound = true;
    let lastThrottle = 0;

    const throttledRecord = () => {
      const now = Date.now();
      if (now - lastThrottle > 5000) {
        lastThrottle = now;
        this.recordUserActivity();
      }
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'scroll'];
    events.forEach((evt) => {
      window.addEventListener(evt, throttledRecord, { passive: true });
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.recordUserActivity();
        }
      });
    }
  }

  /** Return the last user activity timestamp in milliseconds. */
  getLastUserActivityTime(): number {
    return this.lastUserActivityTime;
  }

  /** Return whether keep-alive has paused pinging due to 4+ hours of inactivity. */
  isKeepAliveSleeping(): boolean {
    return this.isSleepingDueToInactivity;
  }

  // -- Command Execution ----------------------------------------------

  /** Invoke a Python slot or API endpoint and await its result. */
  async call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const ok = await this.connect();
    if (!ok) {
      throw new Error('[bridge] not connected to Python');
    }

    // Qt Desktop execution
    if (this.mode === 'qt') {
      const bridge = this.objects.bridge as Record<string, (...a: unknown[]) => void>;
      const fn = bridge?.[method];
      if (typeof fn !== 'function') {
        throw new Error(`[bridge] unknown command: ${method}`);
      }
      return new Promise<T>((resolve, reject) => {
        const done = (result: unknown) => resolve(result as T);
        try {
          fn.apply(this.objects.bridge, [...args, done]);
        } catch (error) {
          reject(error as Error);
        }
      });
    }

    // Cloud HTTP execution
    if (this.mode === 'cloud') {
      let body: string = '';
      if (args.length === 1) {
        body = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]);
      } else if (args.length > 1) {
        body = JSON.stringify(args);
      }

      const res = await fetch(`${this.backendUrl}/api/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body || undefined,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`[bridge] HTTP ${res.status}: ${text}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        return JSON.stringify(json) as unknown as T;
      }
      const text = await res.text();
      return text as unknown as T;
    }

    throw new Error('[bridge] not connected to Python');
  }

  /** Invoke a JSON-argument command and deserialize its result. */
  async callJson<T = unknown>(method: string, payload: unknown): Promise<T> {
    const raw = await this.call<string>(method, JSON.stringify(payload));
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* raw string passthrough */
    }
    return parsed as T;
  }

  /** Subscribe to a structured Python event; returns an unsubscribe fn. */
  onEvent(event: string, listener: EventListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  /** Connection status summary for the UI. */
  async info(): Promise<BridgeConnectionInfo> {
    const connected = await this.connect();
    if (connected) {
      return {
        connected: true,
        version: this.version,
      };
    }
    return {
      connected: false,
      reason: 'Qt transport and cloud backend unavailable (browser mode)',
    };
  }

  // -- Watchlist (Wave 8) --------------------------------------------

  /** Load persisted watchlist from Python. */
  async getWatchlist(): Promise<WatchlistItemBridge[]> {
    const raw = await this.call<string>('getWatchlist');
    const res = JSON.parse(raw) as { ok: boolean; data?: WatchlistItemBridge[]; error?: string };
    if (res.ok && res.data) return res.data;
    return [];
  }

  /** Toggle a symbol in the watchlist (favorites). */
  async toggleWatchlist(symbol: string): Promise<{ symbol: string; is_favorite: boolean } | null> {
    const raw = await this.call<string>('toggleWatchlist', JSON.stringify(symbol));
    const res = JSON.parse(raw) as { ok: boolean; data?: { symbol: string; is_favorite: boolean }; error?: string };
    if (res.ok && res.data) return res.data;
    return null;
  }

  /** Replace the entire watchlist (bulk update). */
  async setWatchlist(symbols: string[]): Promise<number> {
    const raw = await this.callJson<{ ok?: boolean; data?: { updated: number }; updated?: number }>('setWatchlist', { symbols });
    return raw?.data?.updated ?? raw?.updated ?? 0;
  }

  private dispatchEvent(event: string, payload: unknown): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        console.error('[bridge] event listener error:', error);
      }
    }
  }
}
