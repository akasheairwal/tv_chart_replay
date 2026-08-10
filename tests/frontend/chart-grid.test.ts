/**
 * Unit tests for ChartGrid multi-chart layout manager (Wave 8).
 */
import { describe, expect, it, vi } from 'vitest';
import { ChartGrid } from '../../frontend/src/chart/chart-grid';

vi.mock('../../frontend/src/chart/chart-manager', () => {
  return {
    ChartManager: vi.fn().mockImplementation(() => ({
      init: vi.fn(),
      resize: vi.fn(),
      loadHistory: vi.fn(),
      destroy: vi.fn(),
    })),
  };
});

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  (globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 0);
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({
      className: '',
      id: '',
      style: {},
      clientWidth: 800,
      clientHeight: 600,
      appendChild: () => {},
    }),
  };
}

function createMockGridContainer() {
  const children: any[] = [];
  return {
    children,
    innerHTML: '',
    className: '',
    appendChild: (child: any) => children.push(child),
  } as any;
}

describe('ChartGrid Layout Manager', () => {
  it('initializes single layout and switches to 2 and 4 layout panes', () => {
    const container = createMockGridContainer();
    const grid = new ChartGrid(container);

    grid.setLayout('1');
    expect(grid.getLayout()).toBe('1');
    expect(grid.getPanes().length).toBe(1);

    grid.setLayout('2v');
    expect(grid.getLayout()).toBe('2v');
    expect(grid.getPanes().length).toBe(2);

    grid.setLayout('4');
    expect(grid.getLayout()).toBe('4');
    expect(grid.getPanes().length).toBe(4);
  });
});
