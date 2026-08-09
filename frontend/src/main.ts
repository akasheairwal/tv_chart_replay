import './style.css';
import { App } from './app';
import { PythonBridge } from './bridge/python-bridge';

function setStatus(elementId: string, text: string, state?: 'ok' | 'err'): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('ok', 'err');
  if (state) el.classList.add(state);
}

async function boot(): Promise<void> {
  const bridge = new PythonBridge();
  const info = await bridge.info();

  if (info.connected) {
    setStatus('bridge-status', `bridge v${info.version ?? '?'}`, 'ok');
    const pong = await bridge.call<string>('systemPing', 'hello from app');
    setStatus('status-bar', `bridge round-trip: ${pong}`, 'ok');
  } else {
    setStatus('bridge-status', 'browser mode', 'err');
    setStatus('status-bar', 'Qt bridge unavailable - running outside the desktop shell', 'err');
  }

  const app = new App(bridge.connected ? bridge : null);
  app.start();
}

void boot();