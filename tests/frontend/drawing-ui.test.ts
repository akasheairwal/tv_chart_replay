import { describe, expect, it, vi } from 'vitest';
import { DrawingListDialog } from '../../frontend/src/ui/drawing-list-dialog';
import { DrawingStyleEditor } from '../../frontend/src/ui/drawing-style-editor';
import { DrawingToolbar } from '../../frontend/src/ui/drawing-toolbar';
import type { DrawingDefinition } from '../../frontend/src/drawings/drawing-types';

describe('Drawing UI Components', () => {
  it('instantiates and interacts with DrawingToolbar, DrawingStyleEditor, and DrawingListDialog', () => {
    // Mock DOM elements
    const mockContainer = {
      innerHTML: '',
      className: '',
      style: {},
      appendChild: vi.fn(),
      addEventListener: vi.fn(),
      querySelector: vi.fn(),
    };

    if (typeof (globalThis as any).document === 'undefined') {
      (globalThis as any).document = {
        createElement: (tag: string) => {
          return {
            tagName: tag.toUpperCase(),
            style: {},
            className: '',
            innerHTML: '',
            textContent: '',
            title: '',
            appendChild: vi.fn(),
            addEventListener: vi.fn(),
            querySelector: vi.fn(),
            querySelectorAll: vi.fn().mockReturnValue([]),
            getBoundingClientRect: () => ({ top: 100, left: 10, width: 30, height: 30 }),
            classList: {
              add: vi.fn(),
              remove: vi.fn(),
              contains: vi.fn().mockReturnValue(false),
            },
          };
        },
        addEventListener: vi.fn(),
      };
    }

    const mockDrawing: DrawingDefinition = {
      id: 'd-test-1',
      symbol: 'BTCUSDT',
      timeframe: '1H',
      type: 'fib_retracement',
      points: [
        { timestamp: 1700000000, price: 50000 },
        { timestamp: 1700010000, price: 60000 },
      ],
      style: { color: '#ff9800', width: 2 },
      locked: false,
      visible: true,
    };

    const mockEngine = {
      setTool: vi.fn(),
      deleteSelected: vi.fn(),
      clearAll: vi.fn(),
      getDrawings: vi.fn().mockReturnValue([mockDrawing]),
      getSelectedDrawing: vi.fn().mockReturnValue(mockDrawing),
      selectDrawing: vi.fn(),
      updateDrawingStyle: vi.fn(),
      toggleLock: vi.fn(),
      toggleVisibility: vi.fn(),
      setAllVisibility: vi.fn(),
      duplicateDrawing: vi.fn(),
      deleteDrawing: vi.fn(),
    };

    let listOpened = false;
    const toolbar = new DrawingToolbar(
      mockContainer as any,
      mockEngine as any,
      () => { listOpened = true; },
    );
    expect(toolbar).toBeDefined();
    expect(listOpened).toBe(false);

    const styleEditor = new DrawingStyleEditor(
      mockContainer as any,
      mockEngine as any,
    );
    styleEditor.show(mockDrawing);
    expect(styleEditor).toBeDefined();

    const listDialog = new DrawingListDialog(
      mockContainer as any,
      mockEngine as any,
    );
    listDialog.show();
    expect(listDialog).toBeDefined();
  });
});
