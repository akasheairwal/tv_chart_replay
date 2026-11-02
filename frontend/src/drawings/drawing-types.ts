export type DrawingType =
  // Cursor & Navigation
  | 'cursor'
  // Trend Lines & Directional Vectors
  | 'trend_line'
  | 'ray'
  | 'info_line'
  | 'extended_line'
  | 'trend_angle'
  | 'horizontal_line'
  | 'horizontal_ray'
  | 'vertical_line'
  | 'cross_line'
  | 'arrow'
  | 'arrow_marker'
  // Geometric Shapes
  | 'rectangle'
  | 'rotated_rectangle'
  | 'ellipse'
  | 'circle'
  | 'triangle'
  | 'polyline'
  | 'path'
  | 'curve'
  | 'arc'
  // Freehand & Vector Drawing
  | 'brush'
  | 'highlighter'
  | 'pencil'
  | 'pen'
  // Fibonacci & Gann Instruments
  | 'fib_retracement'
  | 'fib_extension'
  | 'fib_projection'
  | 'fib_timezones'
  | 'fib_channel'
  | 'fib_speed_fan'
  | 'fib_circles'
  | 'gann_fan'
  | 'gann_box'
  // Pitchfork Variants
  | 'pitchfork'
  | 'schiff_pitchfork'
  | 'modified_schiff_pitchfork'
  | 'inside_pitchfork'
  // Channels & Envelopes
  | 'parallel_channel'
  | 'regression_channel'
  | 'equidistant_channel'
  | 'flat_top_bottom'
  | 'disjoint_channel'
  // Annotation, Notes & Labels
  | 'text'
  | 'anchored_text'
  | 'note'
  | 'anchored_note'
  | 'signpost'
  | 'callout'
  | 'balloon'
  | 'price_label'
  | 'price_note'
  | 'date_label'
  // Measurement, Risk/Reward & Positions
  | 'price_range'
  | 'date_range'
  | 'date_and_price_range'
  | 'bars_count'
  | 'measurement'
  | 'long_position'
  | 'short_position'
  | 'forecast'
  | 'projection'
  | 'bars_pattern'
  | 'ghost_feed'
  // Chart Patterns & Harmonic Ratios
  | 'head_and_shoulders'
  | 'xabcd_pattern'
  | 'cypher_pattern'
  | 'abcd_pattern'
  | 'triangle_pattern'
  | 'three_drives'
  | 'elliott_impulse'
  | 'elliott_correction'
  | 'elliott_triangle'
  | 'elliott_triple_combo'
  | 'elliott_double_combo'
  | 'cyclic_lines'
  | 'time_cycles'
  | 'sine_line'
  // Volume & Anchored Analysis
  | 'anchored_vwap'
  | 'fixed_range_volume_profile';

export interface DrawingPoint {
  timestamp: number;
  price: number;
}

// ---------------------------------------------------------------------------
// ADR 0006: Multi-Timeframe Visibility Schema
// ---------------------------------------------------------------------------

export interface TimeframeVisibilityRange {
  enabled: boolean;
  minMinutes?: number; // e.g. 1 (1m)
  maxMinutes?: number; // e.g. 1440 (1D)
}

export interface DrawingVisibilityFilter {
  ticks: boolean;
  seconds: TimeframeVisibilityRange;
  minutes: TimeframeVisibilityRange;
  hours: TimeframeVisibilityRange;
  days: boolean;
  weeks: boolean;
  months: boolean;
}

// ---------------------------------------------------------------------------
// ADR 0006: Fibonacci & Pitchfork Ratio Level Definition
// ---------------------------------------------------------------------------

export interface LevelRatioItem {
  index: number;
  enabled: boolean;
  coeff: number; // e.g. 0.618
  color: string; // Hex color
  width?: number; // Level line thickness
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

// ---------------------------------------------------------------------------
// ADR 0006: Text Formatting & Alignment Specification
// ---------------------------------------------------------------------------

export interface DrawingTextOptions {
  content: string;
  fontSize: number; // 10, 12, 14, 16, 20, 24, 28, 32, 40
  fontBold: boolean;
  fontItalic: boolean;
  textColor: string;
  hAlign: 'left' | 'center' | 'right';
  vAlign: 'top' | 'middle' | 'bottom';
  wordWrap: boolean;
  showBackground: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  showBorder: boolean;
  borderColor: string;
  borderWidth: number;
}

// ---------------------------------------------------------------------------
// ADR 0006: Saved Drawing Template Preset
// ---------------------------------------------------------------------------

export interface DrawingTemplate {
  id: string;
  name: string;
  toolType: DrawingType;
  style: Partial<DrawingStyle>;
  createdAt: number;
}

export interface DrawingStyle {
  // Core styling
  color: string;
  width: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  strokeOpacity?: number;
  fillColor?: string;
  fontSize?: number;
  text?: string;
  levels?: Array<number | LevelRatioItem>;
  showLabels?: boolean;
  showPrices?: boolean;
  showPercentages?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
  reverse?: boolean;
  fillOpacity?: number;

  // ADR 0005: Position sizing & risk parameters
  riskReward?: number;
  lotSize?: number;
  accountSize?: number;
  riskPercent?: number;
  riskAmount?: number;
  riskMode?: 'PERCENT' | 'CASH';
  stopPrice?: number;
  targetPrice?: number;
  entryPrice?: number;
  compactStats?: boolean;
  alwaysShowStats?: boolean;
  targetColor?: string;
  stopColor?: string;
  targetOpacity?: number;
  stopOpacity?: number;
  leverage?: number;
  accountCurrency?: string;
  lotPrecision?: number;
  closedPnL?: number;
  outcome?: 'win' | 'loss' | 'open' | 'planned';
  qty?: number;
  exitTimestamp?: number;
  exitPrice?: number;

  // ADR 0006: Directional line endpoints & indicators
  leftEnd?: 'normal' | 'arrow' | 'circle';
  rightEnd?: 'normal' | 'arrow' | 'circle';
  showMiddlePoint?: boolean;
  showPriceLabels?: boolean;

  // ADR 0006: Fibonacci & Gann Appearance Matrix
  useOneColor?: boolean;
  fillBackground?: boolean;
  backgroundOpacity?: number;
  showLevels?: boolean;
  levelsMode?: 'values' | 'percents';
  labelsPositionH?: 'left' | 'center' | 'right';
  labelsPositionV?: 'top' | 'middle' | 'bottom';

  // ADR 0006: Text & Container Options
  textOptions?: DrawingTextOptions;

  // ADR 0006: Measurement & Range Metrics
  showBarsRange?: boolean;
  showDateRange?: boolean;
  showDistancePips?: boolean;
  showAngle?: boolean;

  // ADR 0006: Profile & Analytical Parameters
  source?: 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4';
  bandDeviations?: number[];
  valueAreaVolumePercent?: number;

  // ADR 0006: Pattern & Elliott Waves
  waveDegree?:
    | 'Subminuette'
    | 'Minuette'
    | 'Minute'
    | 'Minor'
    | 'Intermediate'
    | 'Primary'
    | 'Cycle'
    | 'Supercycle'
    | 'Grand Supercycle';
  showRatios?: boolean;
  showWaveLabels?: boolean;
  degree?: string;
}

export interface DrawingDefinition {
  id: string;
  symbol: string;
  timeframe: string;
  type: DrawingType;
  points: DrawingPoint[];
  style: DrawingStyle;
  visibility?: DrawingVisibilityFilter;
  locked: boolean;
  visible: boolean;
}

export type DrawingInteractionState =
  | 'IDLE'
  | 'TOOL_SELECTED'
  | 'DRAWING'
  | 'SELECTED'
  | 'MOVING'
  | 'EDITING_HANDLE'
  | 'CLONING';

export type MagnetMode = 'off' | 'weak' | 'strong';

// ---------------------------------------------------------------------------
// ADR 0004: Declarative Tool Behavior Registry Types
// ---------------------------------------------------------------------------

export type HandleRole =
  | 'vertex'      // Primary vertex (anchor coordinate)
  | 'secondary'   // Extrusion, offset, or control anchor (e.g. channel width, arc curvature)
  | 'midpoint'    // Translation midpoint or median line handle
  | 'dimension'   // Duration or width scaling handle
  | 'target'      // Take-profit handle (risk/reward)
  | 'stop';       // Stop-loss handle (risk/reward)

export type HandleCursor =
  | 'crosshair'
  | 'move'
  | 'nwse-resize'
  | 'nesw-resize'
  | 'ew-resize'
  | 'ns-resize'
  | 'pointer'
  | 'default';

export interface HandleDescriptor {
  index: number;
  role: HandleRole;
  cursor: HandleCursor;
  label?: string;
  resolvePosition?: (points: DrawingPoint[], style: DrawingStyle) => DrawingPoint | null;
  applyConstraint?: (
    draggedPoint: DrawingPoint,
    allPoints: DrawingPoint[],
    style: DrawingStyle
  ) => { updatedPoints: DrawingPoint[]; updatedStyle?: Partial<DrawingStyle> };
}

export type ToolInputMode =
  | 'instant'         // 1-point instant placement (horizontal line, crossline, price label)
  | 'fixed'           // Fixed N-point tools (lines, rectangles, pitchforks, patterns)
  | 'multi_point'     // Dynamic N-points (polyline, path)
  | 'continuous_drag';// Freehand continuous sample stream (brush, pencil, highlighter)

export interface ToolBehaviorDescriptor {
  type: DrawingType;
  name: string;
  category: string;
  pointCount: number; // Exact count or -1 for dynamic
  inputMode: ToolInputMode;
  handles: HandleDescriptor[];
  allowShiftAngleSnap?: boolean;
  allowShiftAspectLock?: boolean;
  allowShiftAxialLock?: boolean;
  allowCtrlClone?: boolean;
  allowMagnet?: boolean;
  description?: string;
  calculatePreview?: (draftPoints: DrawingPoint[], currentCursor: DrawingPoint) => DrawingPoint[];
}

// ---------------------------------------------------------------------------
// Master Tool Behavior Registry
// ---------------------------------------------------------------------------

export const TOOL_BEHAVIOR_REGISTRY: Record<DrawingType, ToolBehaviorDescriptor> = {
  // Cursor
  cursor: {
    type: 'cursor',
    name: 'Select / Cursor',
    category: 'cursor',
    pointCount: 0,
    inputMode: 'instant',
    handles: [],
    allowCtrlClone: false,
    allowMagnet: false,
    description: 'Select, move, and edit drawings on chart canvas',
  },

  // Trend Lines & Directional Vectors
  trend_line: {
    type: 'trend_line',
    name: 'Trend Line',
    category: 'lines',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Endpoint' },
    ],
    allowShiftAngleSnap: true,
    allowShiftAxialLock: true,
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Draw a straight line between two points with angle constraints',
  },
  ray: {
    type: 'ray',
    name: 'Ray',
    category: 'lines',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Direction' },
    ],
    allowShiftAngleSnap: true,
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Ray line originating at P1 and extending indefinitely through P2',
  },
  info_line: {
    type: 'info_line',
    name: 'Info Line',
    category: 'lines',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Endpoint' },
    ],
    allowShiftAngleSnap: true,
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Trendline displaying floating HUD with delta price, %, bars, and angle',
  },
  extended_line: {
    type: 'extended_line',
    name: 'Extended Line',
    category: 'lines',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Point 1' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Point 2' },
    ],
    allowShiftAngleSnap: true,
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Infinite line across the entire chart passing through two anchor points',
  },
  trend_angle: {
    type: 'trend_angle',
    name: 'Trend Angle',
    category: 'lines',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin Vertex' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Angle Arm' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Measures exact steepness or rate of change in degrees relative to horizontal',
  },
  horizontal_line: {
    type: 'horizontal_line',
    name: 'Horizontal Line',
    category: 'lines',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'ns-resize', label: 'Price Level' },
    ],
    allowShiftAxialLock: false,
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Horizontal level across chart with price scale badge',
  },
  horizontal_ray: {
    type: 'horizontal_ray',
    name: 'Horizontal Ray',
    category: 'lines',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin Anchor' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Horizontal ray starting at anchor point extending to the right',
  },
  vertical_line: {
    type: 'vertical_line',
    name: 'Vertical Line',
    category: 'lines',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'ew-resize', label: 'Time Coordinate' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Vertical line spanning chart height at specified timestamp',
  },
  cross_line: {
    type: 'cross_line',
    name: 'Cross Line',
    category: 'lines',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'move', label: 'Intersection Anchor' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Simultaneous intersecting horizontal and vertical guidelines with scale badges',
  },
  arrow: {
    type: 'arrow',
    name: 'Arrow',
    category: 'lines',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Tail Anchor' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Arrowhead' },
    ],
    allowShiftAngleSnap: true,
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Directional arrow pointing to target price bar',
  },
  arrow_marker: {
    type: 'arrow_marker',
    name: 'Arrow Marker',
    category: 'lines',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'move', label: 'Marker Point' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Directional pin marker placed directly onto a candle',
  },

  // Geometric Shapes
  rectangle: {
    type: 'rectangle',
    name: 'Rectangle',
    category: 'shapes',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'nwse-resize', label: 'Top-Left Corner' },
      { index: 1, role: 'vertex', cursor: 'nesw-resize', label: 'Top-Right Corner' },
      { index: 2, role: 'vertex', cursor: 'nwse-resize', label: 'Bottom-Right Corner' },
      { index: 3, role: 'vertex', cursor: 'nesw-resize', label: 'Bottom-Left Corner' },
      { index: 4, role: 'midpoint', cursor: 'ns-resize', label: 'Top Edge Midpoint' },
      { index: 5, role: 'midpoint', cursor: 'ew-resize', label: 'Right Edge Midpoint' },
      { index: 6, role: 'midpoint', cursor: 'ns-resize', label: 'Bottom Edge Midpoint' },
      { index: 7, role: 'midpoint', cursor: 'ew-resize', label: 'Left Edge Midpoint' },
    ],
    allowShiftAspectLock: true,
    allowShiftAxialLock: true,
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Axis-aligned bounding box with 8 handles (4 corners + 4 midpoints) and square-locking modifier',
  },
  rotated_rectangle: {
    type: 'rotated_rectangle',
    name: 'Rotated Rectangle',
    category: 'shapes',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Base Corner 1' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Base Corner 2' },
      { index: 2, role: 'secondary', cursor: 'nesw-resize', label: 'Perpendicular Width' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Rotated rectangle at arbitrary angle defined by baseline and perpendicular width',
  },
  ellipse: {
    type: 'ellipse',
    name: 'Ellipse',
    category: 'shapes',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'nwse-resize', label: 'Corner 1' },
      { index: 1, role: 'vertex', cursor: 'nwse-resize', label: 'Corner 2' },
    ],
    allowShiftAspectLock: true,
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Bounded oval shape with circle-locking modifier',
  },
  circle: {
    type: 'circle',
    name: 'Circle',
    category: 'shapes',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'move', label: 'Center' },
      { index: 1, role: 'secondary', cursor: 'crosshair', label: 'Perimeter Radius' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Radial circle expanding equidistantly from center anchor',
  },
  triangle: {
    type: 'triangle',
    name: 'Triangle',
    category: 'shapes',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Vertex 1' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Vertex 2' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Vertex 3' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '3-point closed geometric polygon',
  },
  polyline: {
    type: 'polyline',
    name: 'Polyline',
    category: 'shapes',
    pointCount: -1,
    inputMode: 'multi_point',
    handles: [],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Multi-segment connected lines committed on double-click or loop closure',
  },
  path: {
    type: 'path',
    name: 'Path',
    category: 'shapes',
    pointCount: -1,
    inputMode: 'multi_point',
    handles: [],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Continuous polyline trajectory mapping complex price/time paths',
  },
  curve: {
    type: 'curve',
    name: 'Curve',
    category: 'shapes',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Start' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'End' },
      { index: 2, role: 'secondary', cursor: 'move', label: 'Curvature Apex' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '3-point quadratic Bézier curved arc',
  },
  arc: {
    type: 'arc',
    name: 'Arc',
    category: 'shapes',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Start' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'End' },
      { index: 2, role: 'secondary', cursor: 'move', label: 'Arc Radius' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Circular arc segment defined by two endpoints and radius point',
  },

  // Freehand & Vector Drawing
  brush: {
    type: 'brush',
    name: 'Brush',
    category: 'freehand',
    pointCount: -1,
    inputMode: 'continuous_drag',
    handles: [],
    allowCtrlClone: true,
    allowMagnet: false,
    description: 'Smooth freehand paint stroke with Catmull-Rom spline interpolation',
  },
  highlighter: {
    type: 'highlighter',
    name: 'Highlighter',
    category: 'freehand',
    pointCount: -1,
    inputMode: 'continuous_drag',
    handles: [],
    allowCtrlClone: true,
    allowMagnet: false,
    description: 'Wide translucent freehand highlighter marker for emphasis',
  },
  pencil: {
    type: 'pencil',
    name: 'Pencil',
    category: 'freehand',
    pointCount: -1,
    inputMode: 'continuous_drag',
    handles: [],
    allowCtrlClone: true,
    allowMagnet: false,
    description: 'Raw un-smoothed 1px freehand sketch line',
  },
  pen: {
    type: 'pen',
    name: 'Pen',
    category: 'freehand',
    pointCount: -1,
    inputMode: 'multi_point',
    handles: [],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Vector path & smooth spline pen tool with node handles',
  },

  // Fibonacci & Gann Instruments
  fib_retracement: {
    type: 'fib_retracement',
    name: 'Fib Retracement',
    category: 'fibonacci',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Swing Base' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Swing Peak' },
    ],
    allowShiftAxialLock: true,
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Standard Fibonacci retracement levels (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.618)',
  },
  fib_extension: {
    type: 'fib_extension',
    name: 'Trend-Based Fib Extension',
    category: 'fibonacci',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Wave 1 Start' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Wave 1 Crest' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Wave 2 Retracement' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '3-point trend expansion projecting Fibonacci extension levels from retracement base',
  },
  fib_projection: {
    type: 'fib_projection',
    name: 'Fib Projection',
    category: 'fibonacci',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Impulse Start' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Impulse Peak' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Correction Base' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '3-point harmonic wave magnitude projection',
  },
  fib_timezones: {
    type: 'fib_timezones',
    name: 'Fib Time Zones',
    category: 'fibonacci',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Cycle Zero' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'First Interval' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Vertical lines spaced at Fibonacci intervals (1, 2, 3, 5, 8, 13, 21...)',
  },
  fib_channel: {
    type: 'fib_channel',
    name: 'Fib Channel',
    category: 'fibonacci',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Baseline Start' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Baseline End' },
      { index: 2, role: 'secondary', cursor: 'nesw-resize', label: 'Channel Width Offset' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Parallel trend bands plotted at Fibonacci expansion multiples',
  },
  fib_speed_fan: {
    type: 'fib_speed_fan',
    name: 'Fib Speed Resistance Fan',
    category: 'fibonacci',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin Apex' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Target Extremum' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Radiating fan rays at Fibonacci ratio angles evaluating speed and support',
  },
  fib_circles: {
    type: 'fib_circles',
    name: 'Fib Circles',
    category: 'fibonacci',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'move', label: 'Center Origin' },
      { index: 1, role: 'secondary', cursor: 'crosshair', label: 'Base Perimeter' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Concentric Fibonacci circles for dynamic support/resistance zones',
  },
  gann_fan: {
    type: 'gann_fan',
    name: 'Gann Fan',
    category: 'advanced',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin Pivot' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: '1x1 Master Ray Reference' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '9 geometric price/time angle rays (1x8, 1x4, 1x3, 1x2, 1x1, 2x1, 3x1, 4x1, 8x1)',
  },
  gann_box: {
    type: 'gann_box',
    name: 'Gann Box',
    category: 'advanced',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'nwse-resize', label: 'Corner 1' },
      { index: 1, role: 'vertex', cursor: 'nwse-resize', label: 'Corner 2' },
    ],
    allowShiftAspectLock: true,
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Gann harmonic grid and diagonal cross rays evaluating price/time squaring',
  },

  // Pitchfork Variants
  pitchfork: {
    type: 'pitchfork',
    name: "Andrews' Pitchfork",
    category: 'advanced',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin Pivot (P1)' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Swing High (P2)' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Swing Low (P3)' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Median line from P1 through midpoint of P2-P3 with parallel outer prongs',
  },
  schiff_pitchfork: {
    type: 'schiff_pitchfork',
    name: 'Schiff Pitchfork',
    category: 'advanced',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin Pivot (P1)' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Swing High (P2)' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Swing Low (P3)' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Pitchfork with origin shifted halfway along price distance between P1 and P2',
  },
  modified_schiff_pitchfork: {
    type: 'modified_schiff_pitchfork',
    name: 'Modified Schiff Pitchfork',
    category: 'advanced',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin Pivot (P1)' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Swing High (P2)' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Swing Low (P3)' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Pitchfork with origin shifted horizontally halfway between P1 and P2 timestamps',
  },
  inside_pitchfork: {
    type: 'inside_pitchfork',
    name: 'Inside Pitchfork',
    category: 'advanced',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Origin Pivot (P1)' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Swing High (P2)' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Swing Low (P3)' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Pitchfork with median line originating from the midpoint of P1 and P2 passing through P3',
  },

  // Channels & Envelopes
  parallel_channel: {
    type: 'parallel_channel',
    name: 'Parallel Channel',
    category: 'channels',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Baseline Anchor 1' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Baseline Anchor 2' },
      { index: 2, role: 'secondary', cursor: 'nesw-resize', label: 'Channel Width Offset' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '3-point parallel corridor (upper bound, lower bound, dashed median) with preserved parallelism',
  },
  regression_channel: {
    type: 'regression_channel',
    name: 'Regression Channel',
    category: 'channels',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'ew-resize', label: 'Start Bar' },
      { index: 1, role: 'vertex', cursor: 'ew-resize', label: 'End Bar' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Ordinary least-squares linear regression trendline flanked by standard deviation bands',
  },
  equidistant_channel: {
    type: 'equidistant_channel',
    name: 'Equidistant Channel',
    category: 'channels',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Baseline 1' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Baseline 2' },
      { index: 2, role: 'secondary', cursor: 'nesw-resize', label: 'Equidistant Offset' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Parallel trend boundaries separated by constant price offset',
  },
  flat_top_bottom: {
    type: 'flat_top_bottom',
    name: 'Flat Top / Bottom Channel',
    category: 'channels',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Horizontal Baseline 1' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Horizontal Baseline 2' },
      { index: 2, role: 'secondary', cursor: 'crosshair', label: 'Angled Opposite Boundary' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Channel with one strictly horizontal boundary and one angled trend boundary',
  },
  disjoint_channel: {
    type: 'disjoint_channel',
    name: 'Disjoint Channel',
    category: 'channels',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Boundary 1 Start' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Boundary 1 End' },
      { index: 2, role: 'secondary', cursor: 'crosshair', label: 'Diverging Boundary' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Diverging or converging wedge channel with independent boundary slopes',
  },

  // Annotation, Notes & Labels
  text: {
    type: 'text',
    name: 'Text',
    category: 'annotation',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'move', label: 'Text Position' },
    ],
    allowCtrlClone: true,
    allowMagnet: false,
    description: 'Floating rich text label anchored to chart coordinates',
  },
  anchored_text: {
    type: 'anchored_text',
    name: 'Anchored Text',
    category: 'annotation',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'move', label: 'Screen Position' },
    ],
    allowCtrlClone: true,
    allowMagnet: false,
    description: 'Screen-locked text annotation remaining stationary during chart zoom/pan',
  },
  note: {
    type: 'note',
    name: 'Note',
    category: 'annotation',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'pointer', label: 'Note Pin' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Clickable/hoverable note pin displaying popup commentary',
  },
  anchored_note: {
    type: 'anchored_note',
    name: 'Anchored Note',
    category: 'annotation',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'pointer', label: 'Screen Pin' },
    ],
    allowCtrlClone: true,
    allowMagnet: false,
    description: 'Screen-locked note pin with modal content editor',
  },
  signpost: {
    type: 'signpost',
    name: 'Signpost',
    category: 'annotation',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'move', label: 'Candle Anchor' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Vertical signpost marker fixed to specific candle event',
  },
  callout: {
    type: 'callout',
    name: 'Callout',
    category: 'annotation',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Pointer Tip' },
      { index: 1, role: 'secondary', cursor: 'move', label: 'Speech Bubble' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Speech bubble with directional leader tail pointing to exact price bar',
  },
  balloon: {
    type: 'balloon',
    name: 'Balloon',
    category: 'annotation',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Target Needle' },
      { index: 1, role: 'secondary', cursor: 'move', label: 'Balloon Body' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Target pointer needle attached to rounded balloon container',
  },
  price_label: {
    type: 'price_label',
    name: 'Price Label',
    category: 'annotation',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'ns-resize', label: 'Price Coordinate' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Pointed price tag badge displaying live numeric price coordinate',
  },
  price_note: {
    type: 'price_note',
    name: 'Price Note',
    category: 'annotation',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'move', label: 'Price Tag' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Price tag badge with editable textual note attachment',
  },
  date_label: {
    type: 'date_label',
    name: 'Date Label',
    category: 'annotation',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'ew-resize', label: 'Timestamp' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Calendar date badge indicating bar date and timestamp',
  },

  // Measurement, Risk/Reward & Positions
  price_range: {
    type: 'price_range',
    name: 'Price Range',
    category: 'measurement',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Level 1' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Level 2' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Vertical dimension arrow measuring price span, pips, and percentage shift',
  },
  date_range: {
    type: 'date_range',
    name: 'Date Range',
    category: 'measurement',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Start Time' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'End Time' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Horizontal dimension arrow measuring bar count and calendar time span',
  },
  bars_count: {
    type: 'bars_count',
    name: 'Bars Count',
    category: 'measurement',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'ew-resize', label: 'Start Bar' },
      { index: 1, role: 'vertex', cursor: 'ew-resize', label: 'End Bar' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Bracket measuring candle distribution and duration between bars',
  },
  date_and_price_range: {
    type: 'date_and_price_range',
    name: 'Date and Price Range',
    category: 'measurement',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Corner 1' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Corner 2' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Persistent 2-dimensional measurement grid quantifying price delta, %, and elapsed duration',
  },
  measurement: {
    type: 'measurement',
    name: 'Measurement Box',
    category: 'measurement',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Corner 1' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Corner 2' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Combined date and price coordinate box displaying bars, delta, %, and volume',
  },
  long_position: {
    type: 'long_position',
    name: 'Long Position',
    category: 'positions',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'target', cursor: 'ns-resize', label: 'Take Profit' },
      { index: 1, role: 'stop', cursor: 'ns-resize', label: 'Stop Loss' },
      { index: 2, role: 'vertex', cursor: 'move', label: 'Entry Level' },
      { index: 3, role: 'dimension', cursor: 'ew-resize', label: 'Duration / Width' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Long trade planner with target profit, stop loss, R:R ratio, and lot sizing',
  },
  short_position: {
    type: 'short_position',
    name: 'Short Position',
    category: 'positions',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'target', cursor: 'ns-resize', label: 'Take Profit' },
      { index: 1, role: 'stop', cursor: 'ns-resize', label: 'Stop Loss' },
      { index: 2, role: 'vertex', cursor: 'move', label: 'Entry Level' },
      { index: 3, role: 'dimension', cursor: 'ew-resize', label: 'Duration / Width' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Short trade planner with target profit, stop loss, R:R ratio, and lot sizing',
  },
  forecast: {
    type: 'forecast',
    name: 'Forecast',
    category: 'measurement',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Entry Anchor' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Target Forecast' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Evaluates trade setup success or failure based on future price execution',
  },
  projection: {
    type: 'projection',
    name: 'Projection',
    category: 'measurement',
    pointCount: 3,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Impulse Start' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Impulse Peak' },
      { index: 2, role: 'secondary', cursor: 'crosshair', label: 'Projection Target' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Swing magnitude measurement projected forward from target date',
  },
  bars_pattern: {
    type: 'bars_pattern',
    name: 'Bars Pattern',
    category: 'measurement',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Start Candle' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'End Candle' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Clones candlestick sequence geometry as ghost overlay for future modeling',
  },
  ghost_feed: {
    type: 'ghost_feed',
    name: 'Ghost Feed',
    category: 'measurement',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Start Bar' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Replication Limit' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Replicates past candle sequence forward for trajectory forecasting',
  },

  // Chart Patterns & Harmonic Ratios
  head_and_shoulders: {
    type: 'head_and_shoulders',
    name: 'Head and Shoulders',
    category: 'patterns',
    pointCount: 7,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Left Shoulder Peak' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Left Neckline Valley' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Head Peak' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Right Neckline Valley' },
      { index: 4, role: 'vertex', cursor: 'crosshair', label: 'Right Shoulder Peak' },
      { index: 5, role: 'vertex', cursor: 'crosshair', label: 'Breakdown Target' },
      { index: 6, role: 'secondary', cursor: 'crosshair', label: 'Neckline Extension' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Classic reversal pattern with left shoulder, head, right shoulder, and neckline',
  },
  xabcd_pattern: {
    type: 'xabcd_pattern',
    name: 'XABCD Pattern',
    category: 'patterns',
    pointCount: 5,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Point X' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Point A' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Point B' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Point C' },
      { index: 4, role: 'vertex', cursor: 'crosshair', label: 'Point D' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '5-point harmonic pattern calculating internal leg Fibonacci retracements',
  },
  cypher_pattern: {
    type: 'cypher_pattern',
    name: 'Cypher Pattern',
    category: 'patterns',
    pointCount: 5,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Point X' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Point A' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Point B' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Point C' },
      { index: 4, role: 'vertex', cursor: 'crosshair', label: 'Point D' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Cypher harmonic pattern with specialized Fibonacci ratio rules',
  },
  abcd_pattern: {
    type: 'abcd_pattern',
    name: 'ABCD Pattern',
    category: 'patterns',
    pointCount: 4,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Point A' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Point B' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Point C' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Point D' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '4-point ABCD harmonic wave swing pattern',
  },
  triangle_pattern: {
    type: 'triangle_pattern',
    name: 'Triangle Pattern',
    category: 'patterns',
    pointCount: 5,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Pivot A' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Pivot B' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Pivot C' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Pivot D' },
      { index: 4, role: 'vertex', cursor: 'crosshair', label: 'Pivot E' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Consolidation triangle pattern with converging upper and lower swings',
  },
  three_drives: {
    type: 'three_drives',
    name: 'Three Drives Pattern',
    category: 'patterns',
    pointCount: 7,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Start 0' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Drive 1' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Correction 1' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Drive 2' },
      { index: 4, role: 'vertex', cursor: 'crosshair', label: 'Correction 2' },
      { index: 5, role: 'vertex', cursor: 'crosshair', label: 'Drive 3' },
      { index: 6, role: 'secondary', cursor: 'crosshair', label: 'Reversal Target' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Harmonic formation of three consecutive symmetrical price drives',
  },
  elliott_impulse: {
    type: 'elliott_impulse',
    name: 'Elliott Wave Impulse (12345)',
    category: 'patterns',
    pointCount: 6,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Wave (0)' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Wave (1)' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Wave (2)' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Wave (3)' },
      { index: 4, role: 'vertex', cursor: 'crosshair', label: 'Wave (4)' },
      { index: 5, role: 'vertex', cursor: 'crosshair', label: 'Wave (5)' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '5-wave trending motive impulse structure with numbered vertex badges',
  },
  elliott_correction: {
    type: 'elliott_correction',
    name: 'Elliott Correction (ABC)',
    category: 'patterns',
    pointCount: 4,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Wave (0)' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Wave (A)' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Wave (B)' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Wave (C)' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '3-wave corrective structure labeled (0)-(A)-(B)-(C)',
  },
  elliott_triangle: {
    type: 'elliott_triangle',
    name: 'Elliott Triangle (ABCDE)',
    category: 'patterns',
    pointCount: 6,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Wave (0)' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Wave (A)' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Wave (B)' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Wave (C)' },
      { index: 4, role: 'vertex', cursor: 'crosshair', label: 'Wave (D)' },
      { index: 5, role: 'vertex', cursor: 'crosshair', label: 'Wave (E)' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: '5-segment contracting corrective triangle labeled (A)-(B)-(C)-(D)-(E)',
  },
  elliott_triple_combo: {
    type: 'elliott_triple_combo',
    name: 'Elliott Triple Combo (WXYXZ)',
    category: 'patterns',
    pointCount: 6,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Wave (0)' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Wave (W)' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Wave (X)' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Wave (Y)' },
      { index: 4, role: 'vertex', cursor: 'crosshair', label: 'Wave (X2)' },
      { index: 5, role: 'vertex', cursor: 'crosshair', label: 'Wave (Z)' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Complex triple three corrective cycle (W-X-Y-X-Z)',
  },
  elliott_double_combo: {
    type: 'elliott_double_combo',
    name: 'Elliott Double Combo (WXY)',
    category: 'patterns',
    pointCount: 4,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Wave (0)' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Wave (W)' },
      { index: 2, role: 'vertex', cursor: 'crosshair', label: 'Wave (X)' },
      { index: 3, role: 'vertex', cursor: 'crosshair', label: 'Wave (Y)' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Double three sideways corrective structure (W-X-Y)',
  },
  cyclic_lines: {
    type: 'cyclic_lines',
    name: 'Cyclic Lines',
    category: 'patterns',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'ew-resize', label: 'Cycle 0' },
      { index: 1, role: 'vertex', cursor: 'ew-resize', label: 'Cycle 1' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Repeating equidistant vertical cycle lines across time axis',
  },
  time_cycles: {
    type: 'time_cycles',
    name: 'Time Cycles',
    category: 'patterns',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Cycle Start' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Cycle Boundary' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Cyclical semi-circular wave loops along bottom time axis',
  },
  sine_line: {
    type: 'sine_line',
    name: 'Sine Line',
    category: 'patterns',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'crosshair', label: 'Node 0' },
      { index: 1, role: 'vertex', cursor: 'crosshair', label: 'Wavelength' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Continuous sinusoidal wave curve matching price oscillation cycle',
  },

  // Volume & Anchored Analysis
  anchored_vwap: {
    type: 'anchored_vwap',
    name: 'Anchored VWAP',
    category: 'volume',
    pointCount: 1,
    inputMode: 'instant',
    handles: [
      { index: 0, role: 'vertex', cursor: 'ew-resize', label: 'Anchor Candle' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Calculates volume-weighted average price dynamically from user-selected starting bar',
  },
  fixed_range_volume_profile: {
    type: 'fixed_range_volume_profile',
    name: 'Fixed Range Volume Profile',
    category: 'volume',
    pointCount: 2,
    inputMode: 'fixed',
    handles: [
      { index: 0, role: 'vertex', cursor: 'ew-resize', label: 'Start Bar' },
      { index: 1, role: 'vertex', cursor: 'ew-resize', label: 'End Bar' },
    ],
    allowCtrlClone: true,
    allowMagnet: true,
    description: 'Horizontal buy/sell volume histogram with POC, VAH, and VAL between specified bars',
  },
};

const DEFAULT_BEHAVIOR_DESCRIPTOR: ToolBehaviorDescriptor = {
  type: 'trend_line',
  name: 'Generic Tool',
  category: 'lines',
  pointCount: 2,
  inputMode: 'fixed',
  handles: [
    { index: 0, role: 'vertex', cursor: 'crosshair' },
    { index: 1, role: 'vertex', cursor: 'crosshair' },
  ],
  allowCtrlClone: true,
  allowMagnet: true,
};

// ---------------------------------------------------------------------------
// Behavior Registry Query Helpers
// ---------------------------------------------------------------------------

export function getToolBehavior(type: DrawingType): ToolBehaviorDescriptor {
  return TOOL_BEHAVIOR_REGISTRY[type] || DEFAULT_BEHAVIOR_DESCRIPTOR;
}

export function getRequiredPointCount(type: DrawingType): number {
  const desc = TOOL_BEHAVIOR_REGISTRY[type];
  if (!desc) return 2;
  return desc.pointCount;
}

export function isInstantCommitTool(type: DrawingType): boolean {
  return getToolBehavior(type).inputMode === 'instant';
}

export function isContinuousDragTool(type: DrawingType): boolean {
  return getToolBehavior(type).inputMode === 'continuous_drag';
}

export function isMultiPointTool(type: DrawingType): boolean {
  return getToolBehavior(type).inputMode === 'multi_point';
}

export function getToolHandles(drawing: DrawingDefinition): HandleDescriptor[] {
  return getToolBehavior(drawing.type).handles;
}

// ---------------------------------------------------------------------------
// Tool Categories for UI Toolbar
// ---------------------------------------------------------------------------

export interface ToolCategory {
  id: string;
  name: string;
  iconKey: string;
  tools: {
    type: DrawingType;
    name: string;
    iconKey: string;
    description: string;
  }[];
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    iconKey: 'cursor',
    tools: [
      { type: 'cursor', name: 'Select / Cursor', iconKey: 'cursor', description: 'Select, move, and edit drawings' },
    ],
  },
  {
    id: 'freehand',
    name: 'Freehand & Pen',
    iconKey: 'brush_cat',
    tools: [
      { type: 'brush', name: 'Brush', iconKey: 'brush', description: 'Smooth freehand paint stroke on chart' },
      { type: 'pencil', name: 'Pencil', iconKey: 'pencil', description: 'Fine freehand sketch & line drawing' },
      { type: 'pen', name: 'Pen', iconKey: 'pen', description: 'Vector path & smooth spline pen tool' },
    ],
  },
  {
    id: 'positions',
    name: 'Position & Risk/Reward',
    iconKey: 'long_position',
    tools: [
      { type: 'long_position', name: 'Long Position', iconKey: 'long_position', description: 'Dynamic Long Risk:Reward tool with TP/SL handles, pips & lot sizing' },
      { type: 'short_position', name: 'Short Position', iconKey: 'short_position', description: 'Dynamic Short Risk:Reward tool with TP/SL handles, pips & lot sizing' },
    ],
  },
  {
    id: 'lines',
    name: 'Lines',
    iconKey: 'lines_cat',
    tools: [
      { type: 'trend_line', name: 'Trend Line', iconKey: 'trend_line', description: 'Draw a straight line between two points' },
      { type: 'ray', name: 'Ray', iconKey: 'ray', description: 'Ray line extending indefinitely' },
      { type: 'extended_line', name: 'Extended Line', iconKey: 'extended_line', description: 'Infinite line across the entire chart' },
      { type: 'horizontal_line', name: 'Horizontal Line', iconKey: 'horizontal_line', description: 'Horizontal level across chart with price badge' },
      { type: 'vertical_line', name: 'Vertical Line', iconKey: 'vertical_line', description: 'Vertical time line' },
      { type: 'arrow', name: 'Arrow', iconKey: 'arrow', description: 'Directional arrow pointing to target' },
    ],
  },
  {
    id: 'shapes',
    name: 'Shapes',
    iconKey: 'shapes_cat',
    tools: [
      { type: 'rectangle', name: 'Rectangle', iconKey: 'rectangle', description: 'Area / zone box' },
      { type: 'ellipse', name: 'Ellipse', iconKey: 'ellipse', description: 'Cycle / target ellipse' },
      { type: 'circle', name: 'Circle', iconKey: 'circle', description: 'Radial circle from center' },
      { type: 'triangle', name: 'Triangle', iconKey: 'triangle', description: '3-point geometric triangle' },
    ],
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci',
    iconKey: 'fibonacci_cat',
    tools: [
      { type: 'fib_retracement', name: 'Fib Retracement', iconKey: 'fib_retracement', description: 'Standard Fibonacci retracement levels' },
      { type: 'fib_extension', name: 'Fib Extension', iconKey: 'fib_extension', description: '3-point trend-based Fibonacci extension' },
      { type: 'fib_projection', name: 'Fib Projection', iconKey: 'fib_projection', description: '3-point Fibonacci swing projection' },
      { type: 'fib_timezones', name: 'Fib Time Zones', iconKey: 'fib_timezones', description: 'Fibonacci time cycle intervals' },
      { type: 'fib_channel', name: 'Fib Channel', iconKey: 'fib_channel', description: 'Parallel Fibonacci channel bands' },
    ],
  },
  {
    id: 'channels',
    name: 'Channels',
    iconKey: 'channels_cat',
    tools: [
      { type: 'parallel_channel', name: 'Parallel Channel', iconKey: 'parallel_channel', description: '3-point parallel channel with median' },
      { type: 'regression_channel', name: 'Regression Channel', iconKey: 'regression_channel', description: 'Linear trend & standard deviation bands' },
      { type: 'equidistant_channel', name: 'Equidistant Channel', iconKey: 'equidistant_channel', description: 'Equidistant trend channel' },
    ],
  },
  {
    id: 'advanced',
    name: 'Pitchfork & Gann',
    iconKey: 'advanced_cat',
    tools: [
      { type: 'pitchfork', name: "Andrews' Pitchfork", iconKey: 'pitchfork', description: '3-point median-line pitchfork' },
      { type: 'schiff_pitchfork', name: 'Schiff Pitchfork', iconKey: 'schiff_pitchfork', description: 'Modified pivot-shifted pitchfork' },
      { type: 'modified_schiff_pitchfork', name: 'Modified Schiff', iconKey: 'modified_schiff_pitchfork', description: 'Halfway horizontal-shifted pitchfork' },
      { type: 'gann_fan', name: 'Gann Fan', iconKey: 'gann_fan', description: 'Gann geometric angle rays (1x8 to 8x1)' },
      { type: 'gann_box', name: 'Gann Box', iconKey: 'gann_box', description: 'Gann harmonic grid and diagonal cross' },
    ],
  },
  {
    id: 'annotation',
    name: 'Annotation',
    iconKey: 'annotation_cat',
    tools: [
      { type: 'text', name: 'Text', iconKey: 'text', description: 'Text label on chart' },
      { type: 'callout', name: 'Callout', iconKey: 'callout', description: 'Speech bubble with arrow pointer' },
      { type: 'price_label', name: 'Price Label', iconKey: 'price_label', description: 'Clickable price badge on chart' },
      { type: 'date_label', name: 'Date Label', iconKey: 'date_label', description: 'Clickable timestamp badge' },
    ],
  },
  {
    id: 'measurement',
    name: 'Measurement',
    iconKey: 'measurement_cat',
    tools: [
      { type: 'measurement', name: 'Measurement Box', iconKey: 'measurement', description: 'Measures candle count, ΔPrice, %, pips, duration, & volume' },
      { type: 'price_range', name: 'Price Range', iconKey: 'price_range', description: 'Vertical price change, pips, and %' },
      { type: 'date_range', name: 'Date Range', iconKey: 'date_range', description: 'Horizontal time, candle count & volume range' },
      { type: 'bars_count', name: 'Bars Count', iconKey: 'bars_count', description: 'Count number of bars / duration' },
    ],
  },
];

// ---------------------------------------------------------------------------
// ADR 0006: Helper Functions and Defaults for Unified Settings & Visibility
// ---------------------------------------------------------------------------

export function createDefaultVisibilityFilter(): DrawingVisibilityFilter {
  return {
    ticks: true,
    seconds: { enabled: true, minMinutes: 0.0166, maxMinutes: 0.99 },
    minutes: { enabled: true, minMinutes: 1, maxMinutes: 59 },
    hours: { enabled: true, minMinutes: 60, maxMinutes: 1439 },
    days: true,
    weeks: true,
    months: true,
  };
}

export function parseTimeframeCategory(tf: string): {
  category: 'ticks' | 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  totalMinutes: number;
} {
  const clean = (tf || '1H').trim();
  const upper = clean.toUpperCase();

  if (upper === 'TICK' || upper === 'TICKS' || upper.endsWith('T')) {
    return { category: 'ticks', totalMinutes: 0 };
  }

  if (clean.endsWith('s') || clean.endsWith('S')) {
    const s = parseInt(clean, 10);
    return { category: 'seconds', totalMinutes: isNaN(s) ? 0.5 : s / 60 };
  }

  // Monthly checks: Uppercase 'M' (e.g. '1M', 'M', 'MONTHLY', '1MONTH')
  if (
    clean === 'M' ||
    clean === '1M' ||
    clean === '3M' ||
    clean === '6M' ||
    clean === '12M' ||
    upper === 'MONTHLY' ||
    upper === '1MONTH' ||
    upper.endsWith('MO')
  ) {
    return { category: 'months', totalMinutes: 43200 };
  }

  if (upper === '1D' || upper === 'D' || upper === 'DAILY') {
    return { category: 'days', totalMinutes: 1440 };
  }
  if (upper === '1W' || upper === 'W' || upper === 'WEEKLY') {
    return { category: 'weeks', totalMinutes: 10080 };
  }

  if (clean.endsWith('h') || clean.endsWith('H')) {
    const h = parseInt(clean, 10);
    const hrs = isNaN(h) ? 1 : h;
    return { category: 'hours', totalMinutes: hrs * 60 };
  }

  if (clean.endsWith('m')) {
    const m = parseInt(clean, 10);
    const mins = isNaN(m) ? 1 : m;
    if (mins >= 60) {
      return { category: 'hours', totalMinutes: mins };
    }
    return { category: 'minutes', totalMinutes: mins };
  }

  // Bare numbers (e.g. "5", "60", "240")
  const num = parseInt(clean, 10);
  if (!isNaN(num)) {
    if (num >= 1440) return { category: 'days', totalMinutes: num };
    if (num >= 60) return { category: 'hours', totalMinutes: num };
    return { category: 'minutes', totalMinutes: num };
  }

  return { category: 'hours', totalMinutes: 60 };
}

export function evaluateDrawingVisibility(
  filter: DrawingVisibilityFilter | undefined,
  timeframe: string
): boolean {
  if (!filter) return true;
  const parsed = parseTimeframeCategory(timeframe);

  switch (parsed.category) {
    case 'ticks':
      return filter.ticks;
    case 'seconds': {
      if (!filter.seconds.enabled) return false;
      const min = filter.seconds.minMinutes ?? 0;
      const max = filter.seconds.maxMinutes ?? 0.9999;
      return parsed.totalMinutes >= min && parsed.totalMinutes <= max;
    }
    case 'minutes': {
      if (!filter.minutes.enabled) return false;
      const min = filter.minutes.minMinutes ?? 1;
      const max = filter.minutes.maxMinutes ?? 59;
      return parsed.totalMinutes >= min && parsed.totalMinutes <= max;
    }
    case 'hours': {
      if (!filter.hours.enabled) return false;
      const min = filter.hours.minMinutes ?? 60;
      const max = filter.hours.maxMinutes ?? 1439;
      return parsed.totalMinutes >= min && parsed.totalMinutes <= max;
    }
    case 'days':
      return filter.days;
    case 'weeks':
      return filter.weeks;
    case 'months':
      return filter.months;
    default:
      return true;
  }
}

export function isDrawingVisibleOnTimeframe(
  drawing: DrawingDefinition,
  timeframe: string
): boolean {
  if (drawing.visible === false) return false;
  return evaluateDrawingVisibility(drawing.visibility, timeframe);
}

export const STANDARD_FIB_COEFFICIENTS = [
  -0.618, -0.382, -0.236, 0.0, 0.236, 0.382, 0.5, 0.618, 0.65, 0.786,
  1.0, 1.272, 1.414, 1.618, 1.786, 2.0, 2.272, 2.414, 2.618, 3.618, 4.236
];

export function createDefaultFibLevels(): LevelRatioItem[] {
  const activeSet = new Set([0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]);
  const defaultColors: Record<number, string> = {
    0.0: '#787b86',
    0.236: '#f23645',
    0.382: '#ff9800',
    0.5: '#2962ff',
    0.618: '#089981',
    0.65: '#089981',
    0.786: '#787b86',
    1.0: '#787b86',
    1.618: '#2962ff',
    2.618: '#ab47bc',
  };

  return STANDARD_FIB_COEFFICIENTS.map((coeff, index) => ({
    index,
    coeff,
    enabled: activeSet.has(coeff),
    color: defaultColors[coeff] || '#787b86',
    width: 1,
    lineStyle: 'solid',
  }));
}

export function createDefaultTextOptions(initialContent: string = ''): DrawingTextOptions {
  return {
    content: initialContent,
    fontSize: 14,
    fontBold: false,
    fontItalic: false,
    textColor: '#ffffff',
    hAlign: 'center',
    vAlign: 'middle',
    wordWrap: true,
    showBackground: false,
    backgroundColor: '#1e222d',
    backgroundOpacity: 0.85,
    showBorder: false,
    borderColor: '#363a45',
    borderWidth: 1,
  };
}
