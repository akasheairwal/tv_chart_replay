import './style.css';
import { App } from './app';
import { PythonBridge } from './bridge/python-bridge';

function setStatus(elementId: string, text: string, state?: 'ok' | 'err'): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  const label = el.querySelector('.status-label');
  if (label) {
    label.textContent = text;
  } else if (elementId === 'bridge-status') {
    el.innerHTML = `<span class="status-dot"></span><span class="status-label">${text}</span>`;
  } else {
    el.textContent = text;
  }
  el.classList.remove('ok', 'err');
  if (state) el.classList.add(state);
}

async function retryCloudConnection(bridge: PythonBridge, app: App, maxAttempts = 15): Promise<void> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    await new Promise((resolve) => setTimeout(resolve, 4000));
    try {
      const ok = await bridge.connect();
      if (ok) {
        setStatus('bridge-status', `bridge v${bridge.version || '0.1.0'}`, 'ok');
        const pong = await bridge.call<string>('systemPing', 'cloud handshake ok');
        setStatus('status-bar', `cloud connected (${pong})`, 'ok');
        app.attachBridge(bridge);
        return;
      }
    } catch {
      // still spinning up
    }
  }
  setStatus('bridge-status', 'cloud offline', 'err');
  setStatus('status-bar', 'Cloud backend unreachable. Operating in browser simulation mode.', 'err');
}

async function boot(): Promise<void> {
  const bridge = new PythonBridge();
  const info = await bridge.info();

  if (info.connected) {
    setStatus('bridge-status', 'connected', 'ok');
    const pong = await bridge.call<string>('systemPing', 'hello from app');
    setStatus('status-bar', `bridge round-trip: ${pong}`, 'ok');
  } else if (bridge.hasBackendUrl()) {
    setStatus('bridge-status', 'waking up...', 'err');
    setStatus('status-bar', 'Cloud backend is waking up (~45s). Running in browser mode while connecting…', 'err');
  } else {
    setStatus('bridge-status', 'disconnected', 'err');
    setStatus('status-bar', 'Qt bridge unavailable - running outside the desktop shell', 'err');
  }

  const app = new App(bridge.connected ? bridge : null);
  (window as any).__app = app;
  await app.start();

  if (!info.connected && bridge.hasBackendUrl()) {
    void retryCloudConnection(bridge, app);
  }
}

void boot();
