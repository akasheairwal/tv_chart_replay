/**
 * Minimal QWebChannel wrapper exposing the Python bridge surface.
 *
 * - `connect()`: locates the Qt WebChannel transport, loads qwebchannel.js
 *   if required, then wires Python -> TS events and reads the app version.
 * - `call<T>(method, ...args)`: invokes a whitelisted Python slot and
 *   returns a Promise of its result.
 * - `onEvent(event, listener)`: subscribes to structured Python events.
 *
 * Outside the Qt desktop shell (plain browser / unit tests) `connect()`
 * resolves to `false` and every `call()` rejects.
 */

import type { BridgeConnectionInfo, EventListener } from './bridge-types';

const QWEBCHANNEL_SCRIPT_URL = 'qrc:///qtwebchannel/qwebchannel.js';

type QWebChannelCallback = (channel: { objects: Record<string, unknown> }) => void;

declare global {
  interface Window {
    QWebChannel?: new (transport: unknown, callback: QWebChannelCallback) => void;
    qt?: { webChannelTransport?: unknown };
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

export class PythonBridge {
  private transportReady: Promise<boolean> | null = null;
  private objects: Record<string, unknown> = {};
  private readonly listeners = new Map<string, Set<EventListener>>();
  connected = false;
  version = '';

  /** Establish the connection (idempotent). */
  async connect(): Promise<boolean> {
    if (this.transportReady === null) {
      this.transportReady = this.doConnect();
    }
    return this.transportReady;
  }

  private async doConnect(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.qt?.webChannelTransport) {
      return false;
    }
    try {
      if (!window.QWebChannel) {
        await loadScript(QWEBCHANNEL_SCRIPT_URL);
      }
      if (!window.QWebChannel) {
        return false;
      }

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
                  /* keep the raw string */
                }
                this.dispatchEvent(name, payload);
              });
            }
            this.connected = true;
            resolve();
          });
        } catch (error) {
          reject(error as Error);
        }
      });

      // Read version directly (do not route through this.call which would
      // deadlock while the connect promise is still pending).
      const versionFn = (this.objects.bridge as Record<string, unknown>).systemVersion as
        | ((cb: (value: unknown) => void) => void)
        | undefined;
      if (typeof versionFn === 'function') {
        versionFn((value) => (this.version = String(value ?? '')));
      }
      return true;
    } catch (error) {
      console.warn('[bridge] connection failed:', error);
      return false;
    }
  }

  /** Invoke a whitelisted Python slot and await its result. */
  async call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const ok = await this.connect();
    if (!ok) {
      throw new Error('[bridge] not connected to Python');
    }
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
    return connected
      ? { connected: true, version: this.version }
      : { connected: false, reason: 'Qt transport unavailable (browser mode)' };
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