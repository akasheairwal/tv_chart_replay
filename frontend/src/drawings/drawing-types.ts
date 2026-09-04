export type DrawingType =
  // Basic
  | 'cursor'
  | 'trend_line'
  | 'ray'
  | 'extended_line'
  | 'horizontal_line'
  | 'vertical_line'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'circle'
  | 'triangle'
  | 'text'
  // Fibonacci (§49-50)
  | 'fib_retracement'
  | 'fib_extension'
  | 'fib_projection'
  | 'fib_timezones'
  | 'fib_channel'
  // Channels
  | 'parallel_channel'
  | 'regression_channel'
  | 'equidistant_channel'
  // Pitchfork & Gann
  | 'pitchfork'
  | 'schiff_pitchfork'
  | 'modified_schiff_pitchfork'
  | 'gann_fan'
  | 'gann_box'
  // Annotation & Labels
  | 'callout'
  | 'price_label'
  | 'date_label'
  // Measurement & Forecasting
  | 'price_range'
  | 'date_range'
  | 'bars_count'
  | 'measurement'
  | 'long_position'
  | 'short_position'
  // Freehand & Vector Drawing
  | 'brush'
  | 'pencil'
  | 'pen';

export interface DrawingPoint {
  timestamp: number;
  price: number;
}

export interface DrawingStyle {
  color: string;
  width: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  fontSize?: number;
  text?: string;
  levels?: number[];
  showLabels?: boolean;
  showPrices?: boolean;
  showPercentages?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
  reverse?: boolean;
  fillOpacity?: number;
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
}

export interface DrawingDefinition {
  id: string;
  symbol: string;
  timeframe: string;
  type: DrawingType;
  points: DrawingPoint[];
  style: DrawingStyle;
  locked: boolean;
  visible: boolean;
}

export type DrawingInteractionState =
  | 'IDLE'
  | 'TOOL_SELECTED'
  | 'DRAWING'
  | 'SELECTED'
  | 'MOVING'
  | 'EDITING_HANDLE';

export function getRequiredPointCount(type: DrawingType): number {
  switch (type) {
    case 'brush':
    case 'pencil':
    case 'pen':
      return -1; // Dynamic freehand multi-point tools
    case 'price_label':
    case 'date_label':
    case 'text': // rendered at p1 only; the second click was dead weight
      return 1;
    case 'fib_extension':
    case 'fib_projection':
    case 'fib_channel':
    case 'parallel_channel':
    case 'equidistant_channel':
    case 'pitchfork':
    case 'schiff_pitchfork':
    case 'modified_schiff_pitchfork':
    case 'triangle':
      return 3;
    case 'long_position':
    case 'short_position':
      return 2; // Progressive creation takes 2 points (or 1 click) and initializes 3 control points (Entry, TP, SL, Width)
    default:
      return 2;
  }
}

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
    iconKey: 'positions_cat',
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
