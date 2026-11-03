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

async function boot(): Promise<void> {
  const bridge = new PythonBridge();
  const info = await bridge.info();

  if (info.connected) {
    setStatus('bridge-status', 'connected', 'ok');
    const pong = await bridge.call<string>('systemPing', 'hello from app');
    setStatus('status-bar', `bridge round-trip: ${pong}`, 'ok');
  } else {
    setStatus('bridge-status', 'disconnected', 'err');
    setStatus('status-bar', 'Qt bridge unavailable - running outside the desktop shell', 'err');
  }

  const app = new App(bridge.connected ? bridge : null);
  (window as any).__app = app;
  await app.start();
}

void boot();