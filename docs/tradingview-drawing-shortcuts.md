# TradingView Drawing Tools Shortcuts & Architectural Mapping

> Official source: [TradingView Help Center — Shortcuts](https://in.tradingview.com/support/shortcuts/) _(Category: **Indicators and drawings**)_

This document compiles all official keyboard shortcuts and interaction modifiers for drawing tools on TradingView. It provides cross-platform mappings (Windows/Linux vs. macOS), input trigger modalities, functional groupings, and an architectural mapping for implementation within chart and replay drawing engines (such as `drawing-engine.ts`).

---

## 1. Master Reference Table

| #   | Action / Tool Name            | Windows / Linux                         | macOS                                   | Input Modality      | Description / Behavior                                                     |
| :-- | :---------------------------- | :-------------------------------------- | :-------------------------------------- | :------------------ | :------------------------------------------------------------------------- |
| 1   | **Trendline**                 | `Alt + T`                               | `⌥ Option + T`                          | Key Combination     | Activates the **Trend Line** drawing tool (`trend_line`).                  |
| 2   | **Horizontal line**           | `Alt + H`                               | `⌥ Option + H`                          | Key Combination     | Places/activates an infinite **Horizontal Line** (`horizontal_line`).      |
| 3   | **Horizontal ray**            | `Alt + J`                               | `⌥ Option + J`                          | Key Combination     | Places/activates a one-directional **Horizontal Ray** (`ray`).             |
| 4   | **Vertical line**             | `Alt + V`                               | `⌥ Option + V`                          | Key Combination     | Places/activates an infinite **Vertical Line** (`vertical_line`).          |
| 5   | **Crossline**                 | `Alt + C`                               | `⌥ Option + C`                          | Key Combination     | Places a bidirectional crosshair intersection point on the chart.          |
| 6   | **Fib retracement**           | `Alt + F`                               | `⌥ Option + F`                          | Key Combination     | Activates the standard **Fibonacci Retracement** tool (`fib_retracement`). |
| 7   | **Rectangle**                 | `Shift + Alt + R`                       | `⇧ Shift + ⌥ Option + R`                | Key Combination     | Activates the **Rectangle** shape drawing tool (`rectangle`).              |
| 8   | **Square**                    | `Rectangle` + `Shift`                   | `Rectangle` + `⇧ Shift`                 | Tool + Modifier Key | Constrains rectangle dimensions to a 1:1 aspect ratio square.              |
| 9   | **Circle**                    | `Ellipse` + `Shift`                     | `Ellipse` + `⇧ Shift`                   | Tool + Modifier Key | Constrains ellipse radii to equal dimensions, producing a perfect circle.  |
| 10  | **45° Angle or Horizontal**   | `Trendline / Channel` + `Shift`         | `Trendline / Channel` + `⇧ Shift`       | Tool + Modifier Key | Snaps line/channel angles to strict 45° increments (0°, 45°, 90°, etc.).   |
| 11  | **Gann box fixed increments** | Hold `Shift`                            | Hold `⇧ Shift`                          | Tool + Modifier Key | Draws Gann Box using fixed square/geometric aspect ratios.                 |
| 12  | **Measure tool**              | Hold `Shift` + `Click`                  | Hold `⇧ Shift` + `Click`                | Key + Mouse Click   | Instantly measures price distance, bars, and percentage change.            |
| 13  | **Demonstration cursor**      | Hold `Alt` + `Draw`                     | Hold `⌥ Option` + `Draw`                | Key + Pointer Drag  | Displays temporary demo pointer/cursor while drawing.                      |
| 14  | **Partially erase**           | `Ctrl` + `Eraser`                       | `⌘ Cmd` + `Eraser`                      | Key + Tool Drag     | Erases intersected segments of lines or drawings instead of full object.   |
| 15  | **Temporary magnet mode**     | `Ctrl` + `Move point`                   | `⌘ Cmd` + `Move point`                  | Key + Handle Drag   | Inverts current Magnet state: snaps anchor to nearest Bar OHLC.            |
| 16  | **Clone a drawing**           | `Ctrl` + `Drag`                         | `⌘ Cmd` + `Drag`                        | Key + Object Drag   | Duplicates the selected drawing and drags the cloned instance.             |
| 17  | **Constrained move (H / V)**  | `Drag` + `Shift`                        | `Drag` + `⇧ Shift`                      | Object Drag + Key   | Locks object translation strictly along the horizontal or vertical axis.   |
| 18  | **Drawings multiselect**      | Hold `Ctrl` + `Click`                   | Hold `⌘ Cmd` + `Click`                  | Key + Mouse Click   | Adds or removes drawings to/from the active selection set.                 |
| 19  | **Nudge drawing left**        | `Arrow Left`                            | `Arrow Left`                            | Single Keypress     | Nudges selected drawing(s) 1 pixel / 1 bar left.                           |
| 20  | **Nudge drawing right**       | `Arrow Right`                           | `Arrow Right`                           | Single Keypress     | Nudges selected drawing(s) 1 pixel / 1 bar right.                          |
| 21  | **Nudge drawing up**          | `Arrow Up`                              | `Arrow Up`                              | Single Keypress     | Nudges selected drawing(s) upward in price space.                          |
| 22  | **Nudge drawing down**        | `Arrow Down`                            | `Arrow Down`                            | Single Keypress     | Nudges selected drawing(s) downward in price space.                        |
| 23  | **Copy selected object**      | `Ctrl + C`                              | `⌘ Cmd + C`                             | Key Combination     | Copies selected drawing definition(s) to the internal clipboard.           |
| 24  | **Paste object**              | `Ctrl + V`                              | `⌘ Cmd + V`                             | Key Combination     | Pastes copied drawing(s) onto active chart at cursor/viewport position.    |
| 25  | **Remove object**             | `Delete` / `Backspace` / `Middle Click` | `Delete` / `Backspace` / `Middle Click` | Key or Mouse Click  | Removes selected drawing object(s) from the chart.                         |
| 26  | **Hide all drawings**         | `Ctrl + Alt + H`                        | `⌘ Cmd + ⌥ Option + H`                  | Key Combination     | Toggles global visibility for all drawings without deleting them.          |
| 27  | **Table cell navigation**     | `Tab` / `Shift + Tab`                   | `Tab` / `⇧ Shift + Tab`                 | Single / Combo Key  | Moves focus to next (`Tab`) or previous (`Shift + Tab`) table cell.        |
| 28  | **Undo drawing action**       | `Ctrl + Z`                              | `⌘ Cmd + Z`                             | Key Combination     | Reverts last drawing placement, edit, or deletion.                         |
| 29  | **Redo drawing action**       | `Ctrl + Y` _(or `Ctrl + Shift + Z`)_    | `⌘ Cmd + Y` _(or `⌘ + ⇧ + Z`)_          | Key Combination     | Reapplies the previously reverted drawing action.                          |

---

## 2. Functional Category Mappings

### 2.1 Tool Activation / Selection Shortcuts

Direct hotkeys to instantly arm drawing tools without opening left toolbar dropdown menus:

- **Trendline**: `Alt + T` (`⌥ + T` on Mac)
- **Horizontal Line**: `Alt + H` (`⌥ + H` on Mac)
- **Horizontal Ray**: `Alt + J` (`⌥ + J` on Mac)
- **Vertical Line**: `Alt + V` (`⌥ + V` on Mac)
- **Crossline**: `Alt + C` (`⌥ + C` on Mac)
- **Fibonacci Retracement**: `Alt + F` (`⌥ + F` on Mac)
- **Rectangle**: `Shift + Alt + R` (`⇧ + ⌥ + R` on Mac)
- **Quick Measure Tool**: Hold `Shift` + Click chart canvas

### 2.2 Geometric & Angle Constraint Modifiers

Modifiers applied during point placement or handle adjustment to enforce geometric invariants:

- **Square (`1:1` Box)**:
  - Select **Rectangle** tool, begin drawing, hold `Shift`.
  - _Constraint_: $\Delta X = \Delta Y$ in screen/pixel space.
- **Circle (Equal Radii)**:
  - Select **Ellipse** tool, begin drawing, hold `Shift`.
  - _Constraint_: Major radius $R_x = R_y$.
- **Orthogonal & 45° Snapping**:
  - Select **Trendline** or **Parallel Channel**, hold `Shift`.
  - _Constraint_: Angles snapped to $\theta \in \{0^\circ, \pm 45^\circ, \pm 90^\circ, \pm 135^\circ, 180^\circ\}$.
- **Gann Box Geometric Scaling**:
  - Select **Gann Box**, hold `Shift`.
  - _Constraint_: Enforces fixed harmonic price/bar intervals.

### 2.3 Object Manipulation & Pointer Snapping

Interactive mouse gestures combined with keyboard modifiers:

- **Clone on Drag**:
  - Select drawing $\rightarrow$ Hold `Ctrl` (`⌘` on Mac) $\rightarrow$ Drag object.
  - _Result_: Retains original object and creates an exact clone at release coordinates.
- **Temporary Magnet Inversion**:
  - Hold `Ctrl` (`⌘` on Mac) while dragging an anchor point or placement cursor.
  - _Result_: If Magnet Mode is OFF, temporarily snaps anchor to OHLC (Open, High, Low, Close) of nearest candle. If Magnet Mode is ON, temporarily disables snapping.
- **Constrained Axial Movement**:
  - Select drawing $\rightarrow$ Begin dragging $\rightarrow$ Hold `Shift`.
  - _Result_: Locks movement strictly to horizontal ($\Delta Y = 0$) or vertical ($\Delta X = 0$).
- **Partial Eraser**:
  - Activate Eraser tool $\rightarrow$ Hold `Ctrl` (`⌘` on Mac) $\rightarrow$ Drag across drawing lines.
  - _Result_: Trims or deletes specific vertices/segments rather than removing whole object.

### 2.4 Selection & Fine Adjustment (Nudging)

- **Multi-Object Selection**:
  - Hold `Ctrl` (`⌘` on Mac) and click objects successively to add to selection.
- **Sub-Pixel / Bar Nudging**:
  - `Arrow Left`: Decrements timestamp/index by 1 bar or $X$ by 1px.
  - `Arrow Right`: Increments timestamp/index by 1 bar or $X$ by 1px.
  - `Arrow Up`: Increments price by 1 tick or $Y$ by 1px.
  - `Arrow Down`: Decrements price by 1 tick or $Y$ by 1px.

### 2.5 Lifecycle & Global Visibility

- **Clipboard Copy**: `Ctrl + C` (`⌘ + C`)
- **Clipboard Paste**: `Ctrl + V` (`⌘ + V`)
- **Delete / Remove**: `Delete`, `Backspace`, or `Middle Mouse Click`
- **Toggle Hide All Drawings**: `Ctrl + Alt + H` (`⌘ + ⌥ + H`)
- **Undo / Redo**: `Ctrl + Z` / `Ctrl + Y` (`⌘ + Z` / `⌘ + ⇧ + Z`)

### 2.6 Table Drawing Navigation

- **Next Cell**: `Tab`
- **Previous Cell**: `Shift + Tab`

---

## 3. Codebase Architecture & Implementation Mapping

Mapping between TradingView official shortcuts and internal application abstractions (e.g. `frontend/src/drawings/`):

### 3.1 Tool Types (`DrawingType`)

| Official Shortcut   | TradingView Name | Internal `DrawingType`                   | Point Count Required |
| :------------------ | :--------------- | :--------------------------------------- | :------------------: |
| `Alt + T`           | Trendline        | `'trend_line'`                           |          2           |
| `Alt + H`           | Horizontal Line  | `'horizontal_line'`                      |          1           |
| `Alt + J`           | Horizontal Ray   | `'ray'`                                  |          2           |
| `Alt + V`           | Vertical Line    | `'vertical_line'`                        |          1           |
| `Alt + C`           | Crossline        | `'crossline'` / `'extended_line'`        |        1 or 2        |
| `Alt + F`           | Fib Retracement  | `'fib_retracement'`                      |          2           |
| `Shift + Alt + R`   | Rectangle        | `'rectangle'`                            |          2           |
| `Rectangle + Shift` | Square           | `'rectangle'` _(with `isSquare: true`)_  |          2           |
| `Ellipse + Shift`   | Circle           | `'circle'` / `'ellipse'` _(equal radii)_ |          2           |
| `Line + Shift`      | 45° Snapped Line | `'trend_line'` _(constrained angle)_     |          2           |
| `Shift + Click`     | Measure Tool     | `'measurement'`                          |          2           |

### 3.2 Keyboard Event Dispatch Matrix (`keydown`)

```typescript
/**
 * Maps raw DOM KeyboardEvent to Drawing Engine commands.
 * Supports cross-platform modifier normalization (Windows Ctrl vs Mac Meta).
 */
export function handleDrawingKeyboardShortcut(
  e: KeyboardEvent,
  engine: DrawingEngine,
): boolean {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const modKey = isMac ? e.metaKey : e.ctrlKey;
  const altKey = e.altKey;
  const shiftKey = e.shiftKey;
  const code = e.code;
  const key = e.key.toLowerCase();

  // 1. Tool Selection (Alt / Option + Key)
  if (altKey && !modKey) {
    if (shiftKey && (key === "r" || code === "KeyR")) {
      e.preventDefault();
      engine.setActiveTool("rectangle");
      return true;
    }
    switch (key) {
      case "t":
        e.preventDefault();
        engine.setActiveTool("trend_line");
        return true;
      case "h":
        e.preventDefault();
        engine.setActiveTool("horizontal_line");
        return true;
      case "j":
        e.preventDefault();
        engine.setActiveTool("ray");
        return true;
      case "v":
        e.preventDefault();
        engine.setActiveTool("vertical_line");
        return true;
      case "c":
        e.preventDefault();
        engine.setActiveTool("cursor"); // or crossline
        return true;
      case "f":
        e.preventDefault();
        engine.setActiveTool("fib_retracement");
        return true;
    }
  }

  // 2. Global Visibility Toggle (Ctrl + Alt + H / Cmd + Option + H)
  if (modKey && altKey && key === "h") {
    e.preventDefault();
    engine.toggleHideAllDrawings();
    return true;
  }

  // 3. Clipboard (Copy / Paste)
  if (modKey && !altKey && !shiftKey) {
    if (key === "c") {
      e.preventDefault();
      engine.copySelectedDrawings();
      return true;
    }
    if (key === "v") {
      e.preventDefault();
      engine.pasteDrawings();
      return true;
    }
    if (key === "z") {
      e.preventDefault();
      engine.undo();
      return true;
    }
    if (key === "y") {
      e.preventDefault();
      engine.redo();
      return true;
    }
  }

  // 4. Deletion
  if (key === "delete" || key === "backspace") {
    if (engine.hasSelection()) {
      e.preventDefault();
      engine.deleteSelectedDrawings();
      return true;
    }
  }

  // 5. Nudging via Arrow Keys
  if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
    if (engine.hasSelection()) {
      e.preventDefault();
      const dx = key === "arrowleft" ? -1 : key === "arrowright" ? 1 : 0;
      const dy = key === "arrowup" ? 1 : key === "arrowdown" ? -1 : 0;
      engine.nudgeSelected(dx, dy, shiftKey ? 5 : 1);
      return true;
    }
  }

  return false;
}
```

### 3.3 Pointer & Drag Modifier Matrix

```typescript
/**
 * Modifier handling during Pointer Move and Pointer Drag.
 */
export function processPointerModifiers(
  e: PointerEvent,
  state: DrawingInteractionState,
) {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const modKey = isMac ? e.metaKey : e.ctrlKey;

  // Clone Mode on Object Drag
  if (state.mode === "dragging" && modKey) {
    state.isCloning = true;
  } else {
    state.isCloning = false;
  }

  // Shift Constraints
  state.isShiftConstrained = e.shiftKey;

  // Temporary Magnet Toggle
  state.isMagnetInverted = modKey && state.mode === "drawing";
}
```

---

## 4. Summary Quick-Sheet

| Trigger                                 | Action        | Target Tool / Object                       |
| --------------------------------------- | ------------- | ------------------------------------------ |
| `Alt + T`                               | Activate      | Trendline                                  |
| `Alt + H`                               | Activate      | Horizontal Line                            |
| `Alt + J`                               | Activate      | Horizontal Ray                             |
| `Alt + V`                               | Activate      | Vertical Line                              |
| `Alt + C`                               | Activate      | Crossline                                  |
| `Alt + F`                               | Activate      | Fib Retracement                            |
| `Shift + Alt + R`                       | Activate      | Rectangle                                  |
| `Shift + Click`                         | Quick Trigger | Measure Tool                               |
| `Shift` (during Draw)                   | Constraint    | Square, Circle, 45° Angle, Gann Fixed Grid |
| `Shift` (during Move)                   | Constraint    | Lock to strict Horizontal or Vertical axis |
| `Ctrl + Drag`                           | Duplication   | Clone drawing                              |
| `Ctrl + Move point`                     | Snapping      | Invert Magnet snap to OHLC                 |
| `Ctrl + Click`                          | Selection     | Multi-select objects                       |
| `Arrow Keys`                            | Adjustment    | Fine nudge (1px / 1 bar / 1 tick)          |
| `Ctrl + C` / `Ctrl + V`                 | Clipboard     | Copy / Paste drawing objects               |
| `Delete` / `Backspace` / `Middle Click` | Removal       | Delete drawing                             |
| `Ctrl + Alt + H`                        | Visibility    | Hide / Show all drawings                   |
| `Tab` / `Shift + Tab`                   | Focus         | Next / Prev cell in Table drawing          |
