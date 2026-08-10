/**
 * Unit tests for Watchlist UI component (Wave 8).
 */
import { describe, expect, it, vi } from 'vitest';
import { Watchlist } from '../../frontend/src/ui/watchlist';

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({
      className: '',
      id: '',
      type: '',
      placeholder: '',
      innerHTML: '',
      textContent: '',
      style: {},
      appendChild: () => {},
      append: () => {},
      addEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
    }),
  };
}

function createMockContainer() {
  const children: any[] = [];
  return {
    children,
    innerHTML: '',
    appendChild: (child: any) => children.push(child),
    querySelectorAll: (_selector?: string) => [],
    querySelector: (_selector?: string) => null,
  } as any;
}

describe('Watchlist UI Component', () => {
  it('renders default items and handles selection', () => {
    const container = createMockContainer();
    const selected: string[] = [];
    const wl = new Watchlist(container, (sym) => selected.push(sym));
    wl.render();

    expect(wl.getItems().length).toBeGreaterThan(0);
    expect(wl.getItems()[0].symbol).toBe('EURUSD');
  });

  it('adds and removes items dynamically', async () => {
    const container = createMockContainer();
    const wl = new Watchlist(container, vi.fn());
    wl.render();

    await wl.addItem('SOLUSDT', 'Solana / USDT', 'crypto');
    expect(wl.getItems().some((i) => i.symbol === 'SOLUSDT')).toBe(true);

    await wl.removeItem('SOLUSDT');
    expect(wl.getItems().some((i) => i.symbol === 'SOLUSDT')).toBe(false);
  });

  it('toggles favorite star status', async () => {
    const container = createMockContainer();
    const wl = new Watchlist(container, vi.fn());
    wl.render();

    await wl.toggleFavorite('EURUSD');
    const items = wl.getItems();
    const eurusd = items.find((i) => i.symbol === 'EURUSD');
    expect(eurusd?.isFavorite).toBe(false);
  });
});
