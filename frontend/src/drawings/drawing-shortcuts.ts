import type { DrawingDefinition, DrawingType } from './drawing-types';

export interface IDrawingShortcutTarget {
  setTool(tool: DrawingType): void;
  getCurrentTool(): DrawingType;
  toggleHideAllDrawings(): boolean;
  copySelected(): boolean;
  paste(): DrawingDefinition[];
  deleteSelected(): void;
  undo(): boolean;
  redo(): boolean;
  nudgeSelected(dBars: number, dTicks: number, stepMultiplier?: number): void;
  selectDrawing(id: string | null): void;
  getSelectedDrawing(): DrawingDefinition | null;
  getSelectedDrawingIds(): string[];
  cancelInteraction?(): void;
}

/**
 * Checks if active focus is inside a user-editable form input (input, textarea, select, contenteditable)
 * to prevent drawing shortcuts from hijacking text typing.
 */
export function isFormInputActive(): boolean {
  if (typeof document === 'undefined') return false;
  const activeEl = document.activeElement;
  if (!activeEl) return false;
  const tag = activeEl.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (activeEl as HTMLElement).isContentEditable
  );
}

/**
 * Returns normalized modifier states across Windows/Linux and macOS.
 */
export function getModifierKeys(e: KeyboardEvent | MouseEvent | PointerEvent) {
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const modKey = isMac ? e.metaKey : e.ctrlKey;
  return {
    modKey,
    altKey: e.altKey,
    shiftKey: e.shiftKey,
    isMac,
  };
}

/**
 * Maps keyboard events to Drawing Engine commands according to official TradingView shortcuts.
 * Returns true if the shortcut was consumed (handled).
 */
export function handleDrawingKeyboardShortcut(
  e: KeyboardEvent,
  target: IDrawingShortcutTarget,
): boolean {
  if (isFormInputActive()) return false;

  const { modKey, altKey, shiftKey } = getModifierKeys(e);
  const code = e.code;
  const key = e.key.toLowerCase();

  // 1. Tool Selection Shortcuts: Alt / Option + Key
  if (altKey && !modKey) {
    if (shiftKey && (code === 'KeyR' || key === 'r')) {
      e.preventDefault();
      target.setTool('rectangle');
      return true;
    }

    if (!shiftKey) {
      if (code === 'KeyT' || key === 't') {
        e.preventDefault();
        target.setTool('trend_line');
        return true;
      }
      if (code === 'KeyH' || key === 'h') {
        e.preventDefault();
        target.setTool('horizontal_line');
        return true;
      }
      if (code === 'KeyJ' || key === 'j') {
        e.preventDefault();
        target.setTool('ray');
        return true;
      }
      if (code === 'KeyV' || key === 'v') {
        e.preventDefault();
        target.setTool('vertical_line');
        return true;
      }
      if (code === 'KeyC' || key === 'c') {
        e.preventDefault();
        target.setTool('cursor');
        return true;
      }
      if (code === 'KeyF' || key === 'f') {
        e.preventDefault();
        target.setTool('fib_retracement');
        return true;
      }
    }
  }

  // 2. Hide / Show all drawings: Ctrl + Alt + H / Cmd + Option + H
  if (modKey && altKey && (code === 'KeyH' || key === 'h')) {
    e.preventDefault();
    target.toggleHideAllDrawings();
    return true;
  }

  // 3. Clipboard & Undo/Redo: Ctrl / Cmd + Key
  if (modKey && !altKey) {
    // Copy
    if (!shiftKey && (code === 'KeyC' || key === 'c')) {
      if (target.copySelected()) {
        e.preventDefault();
        return true;
      }
    }

    // Paste
    if (!shiftKey && (code === 'KeyV' || key === 'v')) {
      const pasted = target.paste();
      if (pasted && pasted.length > 0) {
        e.preventDefault();
        return true;
      }
    }

    // Undo: Ctrl/Cmd + Z
    if (!shiftKey && (code === 'KeyZ' || key === 'z')) {
      if (target.undo()) {
        e.preventDefault();
        return true;
      }
    }

    // Redo: Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z
    const isRedo =
      (!shiftKey && (code === 'KeyY' || key === 'y')) ||
      (shiftKey && (code === 'KeyZ' || key === 'z'));
    if (isRedo) {
      if (target.redo()) {
        e.preventDefault();
        return true;
      }
    }
  }

  // 4. Deletion: Delete / Backspace
  if (!modKey && !altKey && (e.key === 'Delete' || e.key === 'Backspace')) {
    const selected = target.getSelectedDrawing();
    const selectedIds = target.getSelectedDrawingIds();
    if (selected || selectedIds.length > 0) {
      e.preventDefault();
      target.deleteSelected();
      return true;
    }
  }

  // 5. Escape: cancel interaction / deselect / revert to cursor
  if (e.key === 'Escape') {
    if (target.cancelInteraction) {
      target.cancelInteraction();
    }
    if (target.getCurrentTool() !== 'cursor') {
      target.setTool('cursor');
    }
    if (target.getSelectedDrawing() || target.getSelectedDrawingIds().length > 0) {
      target.selectDrawing(null);
    }
    e.preventDefault();
    return true;
  }

  // 6. Arrow Keys Nudging (1 bar / 1 tick, or 5x with Shift)
  const isArrowKey =
    e.key === 'ArrowLeft' ||
    e.key === 'ArrowRight' ||
    e.key === 'ArrowUp' ||
    e.key === 'ArrowDown';
  if (!modKey && !altKey && isArrowKey) {
    const selectedIds = target.getSelectedDrawingIds();
    if (selectedIds.length > 0 || target.getSelectedDrawing()) {
      e.preventDefault();
      const mult = shiftKey ? 5 : 1;
      let dX = 0;
      let dY = 0;
      if (e.key === 'ArrowLeft') dX = -1;
      else if (e.key === 'ArrowRight') dX = 1;
      else if (e.key === 'ArrowUp') dY = 1;
      else if (e.key === 'ArrowDown') dY = -1;

      target.nudgeSelected(dX, dY, mult);
      return true;
    }
  }

  return false;
}

