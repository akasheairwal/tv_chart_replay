/**
 * Declarative Drawing Tool Settings Schema Engine (ADR 0006)
 *
 * Defines strictly typed schemas for all drawing tools, driving dynamic tabbed
 * navigation ([Inputs], [Style], [Text], [Coordinates], [Visibility]), section grouping,
 * field widgets, getters, and setters.
 */

import {
  type DrawingDefinition,
  type DrawingPoint,
  type DrawingStyle,
  type DrawingType,
  type LevelRatioItem,
  createDefaultFibLevels,
  createDefaultTextOptions,
} from './drawing-types';

export type SettingsTabId = 'inputs' | 'style' | 'text' | 'coordinates' | 'visibility';

export type FieldWidgetType =
  | 'color_picker'
  | 'color_opacity'
  | 'line_style'
  | 'line_width'
  | 'number_stepper'
  | 'checkbox'
  | 'select'
  | 'text_input'
  | 'textarea'
  | 'font_styling'
  | 'levels_matrix'
  | 'position_inputs'
  | 'profile_inputs';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface FieldDefinition {
  id: string;
  label: string;
  widget: FieldWidgetType;
  props?: {
    min?: number;
    max?: number;
    step?: number;
    options?: SelectOption[];
    placeholder?: string;
    unit?: string;
    [key: string]: any;
  };
  getter: (style: DrawingStyle, points: DrawingPoint[], def?: DrawingDefinition) => any;
  setter: (value: any, style: DrawingStyle, points: DrawingPoint[], def?: DrawingDefinition) => void;
}

export interface SectionDefinition {
  id: string;
  title?: string;
  collapsible?: boolean;
  fields: FieldDefinition[];
}

export interface ToolSettingsSchema {
  toolType: DrawingType;
  title: string;
  tabs: SettingsTabId[];
  defaultTab: SettingsTabId;
  inputsSections?: SectionDefinition[];
  styleSections?: SectionDefinition[];
  textSections?: SectionDefinition[];
  hasCoordinates: boolean;
  hasVisibility: boolean;
}

// ---------------------------------------------------------------------------
// Reusable Standard Field Definitions
// ---------------------------------------------------------------------------

export const commonFields = {
  strokeColorAndOpacity: (): FieldDefinition => ({
    id: 'stroke_color_opacity',
    label: 'Color & Opacity',
    widget: 'color_opacity',
    getter: (style) => ({
      color: style.color || '#2962ff',
      opacity: style.strokeOpacity ?? style.fillOpacity ?? 1.0,
    }),
    setter: (val, style) => {
      if (val && typeof val === 'object') {
        if (val.color) style.color = val.color;
        if (typeof val.opacity === 'number') {
          style.strokeOpacity = val.opacity;
          if (style.fillBackground === undefined && !style.fillColor) {
            style.fillOpacity = val.opacity;
          }
        }
      } else if (typeof val === 'string') {
        style.color = val;
      }
    },
  }),

  lineWidth: (): FieldDefinition => ({
    id: 'line_width',
    label: 'Line Width',
    widget: 'line_width',
    props: {
      options: [
        { value: 1, label: '1px' },
        { value: 2, label: '2px' },
        { value: 3, label: '3px' },
        { value: 4, label: '4px' },
      ],
    },
    getter: (style) => style.width || 1,
    setter: (val, style) => {
      style.width = Number(val) || 1;
    },
  }),

  lineStyle: (): FieldDefinition => ({
    id: 'line_style',
    label: 'Line Style',
    widget: 'line_style',
    props: {
      options: [
        { value: 'solid', label: 'Solid (—)' },
        { value: 'dashed', label: 'Dashed (---)' },
        { value: 'dotted', label: 'Dotted (···)' },
      ],
    },
    getter: (style) => style.lineStyle || 'solid',
    setter: (val, style) => {
      style.lineStyle = val as 'solid' | 'dashed' | 'dotted';
    },
  }),

  extendLeft: (): FieldDefinition => ({
    id: 'extend_left',
    label: 'Extend Left',
    widget: 'checkbox',
    getter: (style) => style.extendLeft === true,
    setter: (val, style) => {
      style.extendLeft = Boolean(val);
    },
  }),

  extendRight: (): FieldDefinition => ({
    id: 'extend_right',
    label: 'Extend Right',
    widget: 'checkbox',
    getter: (style) => style.extendRight === true,
    setter: (val, style) => {
      style.extendRight = Boolean(val);
    },
  }),

  middlePoint: (): FieldDefinition => ({
    id: 'middle_point',
    label: 'Middle Point',
    widget: 'checkbox',
    getter: (style) => style.showMiddlePoint === true,
    setter: (val, style) => {
      style.showMiddlePoint = Boolean(val);
    },
  }),

  priceLabels: (): FieldDefinition => ({
    id: 'price_labels',
    label: 'Show Price Labels',
    widget: 'checkbox',
    getter: (style) => style.showPriceLabels !== false && style.showPrices !== false,
    setter: (val, style) => {
      style.showPriceLabels = Boolean(val);
      style.showPrices = Boolean(val);
    },
  }),

  leftEnd: (): FieldDefinition => ({
    id: 'left_end',
    label: 'Left End Marker',
    widget: 'select',
    props: {
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'arrow', label: 'Arrow' },
        { value: 'circle', label: 'Circle' },
      ],
    },
    getter: (style) => style.leftEnd || 'normal',
    setter: (val, style) => {
      style.leftEnd = val as 'normal' | 'arrow' | 'circle';
    },
  }),

  rightEnd: (): FieldDefinition => ({
    id: 'right_end',
    label: 'Right End Marker',
    widget: 'select',
    props: {
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'arrow', label: 'Arrow' },
        { value: 'circle', label: 'Circle' },
      ],
    },
    getter: (style) => style.rightEnd || 'normal',
    setter: (val, style) => {
      style.rightEnd = val as 'normal' | 'arrow' | 'circle';
    },
  }),

  fillBackground: (defaultEnabled: boolean = true): FieldDefinition => ({
    id: 'fill_background',
    label: 'Background Fill',
    widget: 'checkbox',
    getter: (style) => (defaultEnabled ? style.fillBackground !== false : style.fillBackground === true),
    setter: (val, style) => {
      style.fillBackground = Boolean(val);
    },
  }),

  fillColorAndOpacity: (): FieldDefinition => ({
    id: 'fill_color_opacity',
    label: 'Background Color & Opacity',
    widget: 'color_opacity',
    getter: (style) => ({
      color: style.fillColor || style.color || '#2962ff',
      opacity: style.fillOpacity ?? style.backgroundOpacity ?? 0.2,
    }),
    setter: (val, style) => {
      if (val && typeof val === 'object') {
        if (val.color) style.fillColor = val.color;
        if (typeof val.opacity === 'number') {
          style.fillOpacity = val.opacity;
          style.backgroundOpacity = val.opacity;
        }
      } else if (typeof val === 'string') {
        style.fillColor = val;
      }
    },
  }),

  textEditorSection: (): SectionDefinition => ({
    id: 'sec_text_annotation',
    title: 'Text Annotation',
    fields: [
      {
        id: 'text_content',
        label: 'Text',
        widget: 'textarea',
        getter: (style) => style.textOptions?.content ?? style.text ?? '',
        setter: (val, style) => {
          style.text = String(val || '');
          if (!style.textOptions) style.textOptions = createDefaultTextOptions(style.text);
          style.textOptions.content = String(val || '');
        },
      },
      {
        id: 'font_styling',
        label: 'Typography',
        widget: 'font_styling',
        getter: (style) => ({
          fontSize: style.textOptions?.fontSize ?? style.fontSize ?? 14,
          fontBold: style.textOptions?.fontBold ?? false,
          fontItalic: style.textOptions?.fontItalic ?? false,
          textColor: style.textOptions?.textColor ?? '#ffffff',
        }),
        setter: (val, style) => {
          if (!style.textOptions) style.textOptions = createDefaultTextOptions(style.text || '');
          if (val && typeof val === 'object') {
            if (val.fontSize) {
              style.textOptions.fontSize = val.fontSize;
              style.fontSize = val.fontSize;
            }
            if (val.fontBold !== undefined) style.textOptions.fontBold = Boolean(val.fontBold);
            if (val.fontItalic !== undefined) style.textOptions.fontItalic = Boolean(val.fontItalic);
            if (val.textColor) style.textOptions.textColor = val.textColor;
          }
        },
      },
      {
        id: 'h_align',
        label: 'Horizontal Alignment',
        widget: 'select',
        props: {
          options: [
            { value: 'left', label: 'Left (◄)' },
            { value: 'center', label: 'Center (▲)' },
            { value: 'right', label: 'Right (►)' },
          ],
        },
        getter: (style) => style.textOptions?.hAlign ?? style.labelsPositionH ?? 'center',
        setter: (val, style) => {
          if (!style.textOptions) style.textOptions = createDefaultTextOptions(style.text || '');
          style.textOptions.hAlign = val as 'left' | 'center' | 'right';
          style.labelsPositionH = val as 'left' | 'center' | 'right';
        },
      },
      {
        id: 'v_align',
        label: 'Vertical Alignment',
        widget: 'select',
        props: {
          options: [
            { value: 'top', label: 'Top (▲)' },
            { value: 'middle', label: 'Middle (■)' },
            { value: 'bottom', label: 'Bottom (▼)' },
          ],
        },
        getter: (style) => style.textOptions?.vAlign ?? style.labelsPositionV ?? 'middle',
        setter: (val, style) => {
          if (!style.textOptions) style.textOptions = createDefaultTextOptions(style.text || '');
          style.textOptions.vAlign = val as 'top' | 'middle' | 'bottom';
          style.labelsPositionV = val as 'top' | 'middle' | 'bottom';
        },
      },
      {
        id: 'word_wrap',
        label: 'Word Wrap',
        widget: 'checkbox',
        getter: (style) => style.textOptions?.wordWrap ?? true,
        setter: (val, style) => {
          if (!style.textOptions) style.textOptions = createDefaultTextOptions(style.text || '');
          style.textOptions.wordWrap = Boolean(val);
        },
      },
      {
        id: 'text_box_background',
        label: 'Text Box Background',
        widget: 'color_opacity',
        getter: (style) => ({
          color: style.textOptions?.backgroundColor ?? '#1e222d',
          opacity: style.textOptions?.showBackground ? (style.textOptions.backgroundOpacity ?? 0.85) : 0,
        }),
        setter: (val, style) => {
          if (!style.textOptions) style.textOptions = createDefaultTextOptions(style.text || '');
          if (val && typeof val === 'object') {
            if (val.color) style.textOptions.backgroundColor = val.color;
            if (typeof val.opacity === 'number') {
              style.textOptions.showBackground = val.opacity > 0;
              style.textOptions.backgroundOpacity = val.opacity;
            }
          }
        },
      },
    ],
  }),
};

// ---------------------------------------------------------------------------
// Category Archetype Factories
// ---------------------------------------------------------------------------

function buildDirectionalLineSchema(toolType: DrawingType, title: string): ToolSettingsSchema {
  const isRay = toolType === 'ray' || toolType === 'horizontal_ray';
  const isExtended = toolType === 'extended_line';
  const isInfoLine = toolType === 'info_line';
  const isTrendAngle = toolType === 'trend_angle';
  const isArrow = toolType === 'arrow' || toolType === 'arrow_marker';

  const lineFields: FieldDefinition[] = [
    commonFields.strokeColorAndOpacity(),
    commonFields.lineWidth(),
    commonFields.lineStyle(),
  ];

  const extensionFields: FieldDefinition[] = [];
  if (!isRay && !isExtended) {
    extensionFields.push(commonFields.extendLeft());
    extensionFields.push(commonFields.extendRight());
  }
  extensionFields.push(commonFields.middlePoint());
  extensionFields.push(commonFields.priceLabels());

  if (isArrow) {
    extensionFields.push(commonFields.leftEnd());
    extensionFields.push(commonFields.rightEnd());
  }

  const sections: SectionDefinition[] = [
    {
      id: 'sec_line',
      title: 'Line Appearance',
      fields: lineFields,
    },
    {
      id: 'sec_extensions',
      title: 'Extensions & Markers',
      fields: extensionFields,
    },
  ];

  if (isInfoLine) {
    sections.push({
      id: 'sec_stats',
      title: 'Metrics & Stats',
      fields: [
        {
          id: 'show_bars_range',
          label: 'Show Bars Range',
          widget: 'checkbox',
          getter: (s) => s.showBarsRange ?? true,
          setter: (v, s) => {
            s.showBarsRange = Boolean(v);
          },
        },
        {
          id: 'show_distance_pips',
          label: 'Show Distance (Pips)',
          widget: 'checkbox',
          getter: (s) => s.showDistancePips ?? true,
          setter: (v, s) => {
            s.showDistancePips = Boolean(v);
          },
        },
        {
          id: 'show_angle',
          label: 'Show Angle',
          widget: 'checkbox',
          getter: (s) => s.showAngle ?? false,
          setter: (v, s) => {
            s.showAngle = Boolean(v);
          },
        },
      ],
    });
  }

  if (isTrendAngle) {
    sections.push({
      id: 'sec_angle',
      title: 'Angle Indicator',
      fields: [
        {
          id: 'show_angle_badge',
          label: 'Show Angle Badge',
          widget: 'checkbox',
          getter: (s) => s.showAngle ?? true,
          setter: (v, s) => {
            s.showAngle = Boolean(v);
          },
        },
      ],
    });
  }

  return {
    toolType,
    title,
    tabs: ['style', 'text', 'coordinates', 'visibility'],
    defaultTab: 'style',
    styleSections: sections,
    textSections: [commonFields.textEditorSection()],
    hasCoordinates: true,
    hasVisibility: true,
  };
}

function buildFibonacciSchema(toolType: DrawingType, title: string): ToolSettingsSchema {
  return {
    toolType,
    title,
    tabs: ['style', 'coordinates', 'visibility'],
    defaultTab: 'style',
    styleSections: [
      {
        id: 'sec_trend_line',
        title: 'Trend Line',
        fields: [
          commonFields.strokeColorAndOpacity(),
          commonFields.lineWidth(),
          commonFields.lineStyle(),
        ],
      },
      {
        id: 'sec_fib_levels',
        title: 'Ratio Levels Matrix',
        fields: [
          {
            id: 'fib_levels_table',
            label: 'Levels',
            widget: 'levels_matrix',
            getter: (style) => style.levels || createDefaultFibLevels(),
            setter: (val, style) => {
              style.levels = val as LevelRatioItem[];
            },
          },
          {
            id: 'use_one_color',
            label: 'Use One Color',
            widget: 'checkbox',
            getter: (s) => s.useOneColor === true,
            setter: (v, s) => {
              s.useOneColor = Boolean(v);
            },
          },
          commonFields.fillBackground(),
          {
            id: 'bg_opacity',
            label: 'Background Opacity',
            widget: 'number_stepper',
            props: { min: 0, max: 100, step: 5, unit: '%' },
            getter: (s) => Math.round((s.backgroundOpacity ?? s.fillOpacity ?? 0.15) * 100),
            setter: (v, s) => {
              const alpha = Math.max(0, Math.min(100, Number(v) || 0)) / 100;
              s.backgroundOpacity = alpha;
              s.fillOpacity = alpha;
            },
          },
          {
            id: 'reverse_levels',
            label: 'Reverse',
            widget: 'checkbox',
            getter: (s) => s.reverse === true,
            setter: (v, s) => {
              s.reverse = Boolean(v);
            },
          },
        ],
      },
      {
        id: 'sec_display_labels',
        title: 'Display & Labels',
        fields: [
          commonFields.priceLabels(),
          {
            id: 'show_levels',
            label: 'Show Levels',
            widget: 'checkbox',
            getter: (s) => s.showLevels !== false,
            setter: (v, s) => {
              s.showLevels = Boolean(v);
            },
          },
          {
            id: 'levels_mode',
            label: 'Levels Mode',
            widget: 'select',
            props: {
              options: [
                { value: 'values', label: 'Values' },
                { value: 'percents', label: 'Percents (%)' },
              ],
            },
            getter: (s) => s.levelsMode || 'values',
            setter: (v, s) => {
              s.levelsMode = v as 'values' | 'percents';
            },
          },
          {
            id: 'labels_h_align',
            label: 'Labels Position (H)',
            widget: 'select',
            props: {
              options: [
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ],
            },
            getter: (s) => s.labelsPositionH || 'left',
            setter: (v, s) => {
              s.labelsPositionH = v as 'left' | 'center' | 'right';
            },
          },
          commonFields.extendLeft(),
          commonFields.extendRight(),
        ],
      },
    ],
    hasCoordinates: true,
    hasVisibility: true,
  };
}

function buildPitchforkAndChannelSchema(
  toolType: DrawingType,
  title: string
): ToolSettingsSchema {
  const isRegression = toolType === 'regression_channel';
  const tabs: SettingsTabId[] = isRegression
    ? ['inputs', 'style', 'coordinates', 'visibility']
    : ['style', 'coordinates', 'visibility'];

  const styleSections: SectionDefinition[] = [
    {
      id: 'sec_median_line',
      title: 'Median / Main Axis',
      fields: [
        commonFields.strokeColorAndOpacity(),
        commonFields.lineWidth(),
        commonFields.lineStyle(),
      ],
    },
    {
      id: 'sec_channel_fill',
      title: 'Channel Fill & Extensions',
      fields: [
        commonFields.fillBackground(),
        commonFields.fillColorAndOpacity(),
        commonFields.extendLeft(),
        commonFields.extendRight(),
      ],
    },
  ];

  const inputsSections: SectionDefinition[] = [];
  if (isRegression) {
    inputsSections.push({
      id: 'sec_reg_inputs',
      title: 'Regression Inputs',
      fields: [
        {
          id: 'reg_source',
          label: 'Source',
          widget: 'select',
          props: {
            options: [
              { value: 'close', label: 'Close' },
              { value: 'open', label: 'Open' },
              { value: 'high', label: 'High' },
              { value: 'low', label: 'Low' },
              { value: 'hlc3', label: 'HLC3' },
            ],
          },
          getter: (s) => s.source || 'close',
          setter: (v, s) => {
            s.source = v as any;
          },
        },
        {
          id: 'upper_dev',
          label: 'Upper Deviation (σ)',
          widget: 'number_stepper',
          props: { min: 0.1, max: 10, step: 0.1 },
          getter: (s) => s.bandDeviations?.[0] ?? 2.0,
          setter: (v, s) => {
            if (!s.bandDeviations) s.bandDeviations = [2.0, 2.0];
            s.bandDeviations[0] = Number(v) || 2.0;
          },
        },
        {
          id: 'lower_dev',
          label: 'Lower Deviation (σ)',
          widget: 'number_stepper',
          props: { min: 0.1, max: 10, step: 0.1 },
          getter: (s) => s.bandDeviations?.[1] ?? 2.0,
          setter: (v, s) => {
            if (!s.bandDeviations) s.bandDeviations = [2.0, 2.0];
            s.bandDeviations[1] = Number(v) || 2.0;
          },
        },
      ],
    });
  }

  return {
    toolType,
    title,
    tabs,
    defaultTab: isRegression ? 'inputs' : 'style',
    inputsSections: isRegression ? inputsSections : undefined,
    styleSections,
    hasCoordinates: true,
    hasVisibility: true,
  };
}

function buildGeometricShapeSchema(toolType: DrawingType, title: string): ToolSettingsSchema {
  const isRectangle = toolType === 'rectangle';
  const isFreehandLine = ['polyline', 'path', 'curve', 'arc'].includes(toolType);

  const borderFields: FieldDefinition[] = [
    commonFields.strokeColorAndOpacity(),
    commonFields.lineWidth(),
    commonFields.lineStyle(),
  ];

  const fillFields: FieldDefinition[] = [
    commonFields.fillBackground(!isFreehandLine),
    commonFields.fillColorAndOpacity(),
  ];

  if (isRectangle) {
    fillFields.push(commonFields.extendLeft());
    fillFields.push(commonFields.extendRight());
  }

  return {
    toolType,
    title,
    tabs: ['style', 'text', 'coordinates', 'visibility'],
    defaultTab: 'style',
    styleSections: [
      {
        id: 'sec_shape_border',
        title: 'Border & Stroke',
        fields: borderFields,
      },
      {
        id: 'sec_shape_fill',
        title: 'Fill & Shading',
        fields: fillFields,
      },
    ],
    textSections: [commonFields.textEditorSection()],
    hasCoordinates: true,
    hasVisibility: true,
  };
}

function buildFreehandSchema(toolType: DrawingType, title: string): ToolSettingsSchema {
  return {
    toolType,
    title,
    tabs: ['style', 'coordinates', 'visibility'],
    defaultTab: 'style',
    styleSections: [
      {
        id: 'sec_freehand',
        title: 'Stroke Appearance',
        fields: [
          commonFields.strokeColorAndOpacity(),
          commonFields.lineWidth(),
        ],
      },
    ],
    hasCoordinates: true,
    hasVisibility: true,
  };
}

function buildAnnotationSchema(toolType: DrawingType, title: string): ToolSettingsSchema {
  const isPriceOrDateLabel = toolType === 'price_label' || toolType === 'date_label';

  if (isPriceOrDateLabel) {
    return {
      toolType,
      title,
      tabs: ['style', 'coordinates', 'visibility'],
      defaultTab: 'style',
      styleSections: [
        {
          id: 'sec_label_style',
          title: 'Label Styling',
          fields: [
            commonFields.strokeColorAndOpacity(),
            commonFields.lineWidth(),
            commonFields.fillColorAndOpacity(),
          ],
        },
      ],
      hasCoordinates: true,
      hasVisibility: true,
    };
  }

  return {
    toolType,
    title,
    tabs: ['text', 'coordinates', 'visibility'],
    defaultTab: 'text',
    textSections: [commonFields.textEditorSection()],
    hasCoordinates: true,
    hasVisibility: true,
  };
}

function buildPositionSchema(toolType: DrawingType, title: string): ToolSettingsSchema {
  return {
    toolType,
    title,
    tabs: ['inputs', 'style', 'coordinates', 'visibility'],
    defaultTab: 'inputs',
    inputsSections: [
      {
        id: 'sec_pos_inputs',
        title: 'Financial & Risk Inputs',
        fields: [
          {
            id: 'pos_calculator_matrix',
            label: 'Position Parameters',
            widget: 'position_inputs',
            getter: (style, points) => ({
              accountSize: style.accountSize ?? 10000,
              accountCurrency: style.accountCurrency ?? 'USD',
              riskMode: style.riskMode ?? 'PERCENT',
              riskPercent: style.riskPercent ?? 1.0,
              riskAmount: style.riskAmount ?? 100,
              entryPrice: points[0]?.price ?? 0,
              tpPrice: points[1]?.price ?? 0,
              slPrice: points[2]?.price ?? 0,
              leverage: style.leverage ?? 1,
              lotPrecision: style.lotPrecision ?? 2,
            }),
            setter: (val, style, points) => {
              if (val && typeof val === 'object') {
                if (val.accountSize !== undefined) style.accountSize = Number(val.accountSize);
                if (val.accountCurrency) style.accountCurrency = String(val.accountCurrency);
                if (val.riskMode) style.riskMode = val.riskMode;
                if (val.riskPercent !== undefined) style.riskPercent = Number(val.riskPercent);
                if (val.riskAmount !== undefined) style.riskAmount = Number(val.riskAmount);
                if (val.leverage !== undefined) style.leverage = Number(val.leverage);
                if (val.lotPrecision !== undefined) style.lotPrecision = Number(val.lotPrecision);

                if (val.entryPrice !== undefined && points[0]) points[0].price = Number(val.entryPrice);
                if (val.tpPrice !== undefined && points[1]) points[1].price = Number(val.tpPrice);
                if (val.slPrice !== undefined && points[2]) points[2].price = Number(val.slPrice);
              }
            },
          },
        ],
      },
    ],
    styleSections: [
      {
        id: 'sec_pos_zones',
        title: 'Zones Appearance',
        fields: [
          {
            id: 'target_zone_color',
            label: 'Profit Target Zone',
            widget: 'color_opacity',
            getter: (s) => ({
              color: s.targetColor || '#089981',
              opacity: s.targetOpacity ?? 0.2,
            }),
            setter: (val, s) => {
              if (val && typeof val === 'object') {
                if (val.color) s.targetColor = val.color;
                if (typeof val.opacity === 'number') s.targetOpacity = val.opacity;
              }
            },
          },
          {
            id: 'stop_zone_color',
            label: 'Stop Loss Zone',
            widget: 'color_opacity',
            getter: (s) => ({
              color: s.stopColor || '#f23645',
              opacity: s.stopOpacity ?? 0.2,
            }),
            setter: (val, s) => {
              if (val && typeof val === 'object') {
                if (val.color) s.stopColor = val.color;
                if (typeof val.opacity === 'number') s.stopOpacity = val.opacity;
              }
            },
          },
          commonFields.lineWidth(),
          {
            id: 'compact_stats',
            label: 'Compact Stats Mode',
            widget: 'checkbox',
            getter: (s) => s.compactStats === true,
            setter: (v, s) => {
              s.compactStats = Boolean(v);
            },
          },
          {
            id: 'always_show_stats',
            label: 'Always Show Stats',
            widget: 'checkbox',
            getter: (s) => s.alwaysShowStats === true,
            setter: (v, s) => {
              s.alwaysShowStats = Boolean(v);
            },
          },
          commonFields.priceLabels(),
        ],
      },
    ],
    hasCoordinates: true,
    hasVisibility: true,
  };
}

function buildMeasurementSchema(toolType: DrawingType, title: string): ToolSettingsSchema {
  return {
    toolType,
    title,
    tabs: ['style', 'coordinates', 'visibility'],
    defaultTab: 'style',
    styleSections: [
      {
        id: 'sec_measure_stroke',
        title: 'Line & Border',
        fields: [
          commonFields.strokeColorAndOpacity(),
          commonFields.lineWidth(),
          commonFields.lineStyle(),
        ],
      },
      {
        id: 'sec_measure_fill',
        title: 'Fill & Shading',
        fields: [
          commonFields.fillBackground(),
          commonFields.fillColorAndOpacity(),
        ],
      },
      {
        id: 'sec_measure_stats',
        title: 'Metrics & Badges',
        fields: [
          {
            id: 'show_bars_range',
            label: 'Show Bars Range',
            widget: 'checkbox',
            getter: (s) => s.showBarsRange ?? true,
            setter: (v, s) => {
              s.showBarsRange = Boolean(v);
            },
          },
          {
            id: 'show_date_range',
            label: 'Show Date & Time',
            widget: 'checkbox',
            getter: (s) => s.showDateRange ?? true,
            setter: (v, s) => {
              s.showDateRange = Boolean(v);
            },
          },
          {
            id: 'show_distance_pips',
            label: 'Show Distance (Pips)',
            widget: 'checkbox',
            getter: (s) => s.showDistancePips ?? true,
            setter: (v, s) => {
              s.showDistancePips = Boolean(v);
            },
          },
          {
            id: 'show_percentage',
            label: 'Show Percentage Change (%)',
            widget: 'checkbox',
            getter: (s) => s.showPercentages ?? true,
            setter: (v, s) => {
              s.showPercentages = Boolean(v);
            },
          },
        ],
      },
    ],
    hasCoordinates: true,
    hasVisibility: true,
  };
}

function buildPatternSchema(toolType: DrawingType, title: string): ToolSettingsSchema {
  const isElliott = toolType.startsWith('elliott_');

  const fields: FieldDefinition[] = [
    commonFields.strokeColorAndOpacity(),
    commonFields.lineWidth(),
    commonFields.lineStyle(),
    commonFields.fillBackground(),
    commonFields.fillColorAndOpacity(),
  ];

  if (isElliott) {
    fields.push({
      id: 'wave_degree',
      label: 'Wave Degree',
      widget: 'select',
      props: {
        options: [
          { value: 'Subminuette', label: 'Subminuette' },
          { value: 'Minuette', label: 'Minuette' },
          { value: 'Minute', label: 'Minute' },
          { value: 'Minor', label: 'Minor' },
          { value: 'Intermediate', label: 'Intermediate' },
          { value: 'Primary', label: 'Primary' },
          { value: 'Cycle', label: 'Cycle' },
          { value: 'Supercycle', label: 'Supercycle' },
          { value: 'Grand Supercycle', label: 'Grand Supercycle' },
        ],
      },
      getter: (s) => s.waveDegree || s.degree || 'Minor',
      setter: (v, s) => {
        s.waveDegree = v as any;
        s.degree = String(v);
      },
    });
    fields.push({
      id: 'show_wave_labels',
      label: 'Show Wave Labels',
      widget: 'checkbox',
      getter: (s) => s.showWaveLabels !== false && s.showLabels !== false,
      setter: (v, s) => {
        s.showWaveLabels = Boolean(v);
        s.showLabels = Boolean(v);
      },
    });
  } else {
    fields.push({
      id: 'show_ratios',
      label: 'Show Ratios',
      widget: 'checkbox',
      getter: (s) => s.showRatios !== false,
      setter: (v, s) => {
        s.showRatios = Boolean(v);
      },
    });
  }

  return {
    toolType,
    title,
    tabs: ['style', 'text', 'coordinates', 'visibility'],
    defaultTab: 'style',
    styleSections: [
      {
        id: 'sec_pattern_style',
        title: 'Structure Appearance',
        fields,
      },
    ],
    textSections: [commonFields.textEditorSection()],
    hasCoordinates: true,
    hasVisibility: true,
  };
}

function buildVolumeAndProfileSchema(toolType: DrawingType, title: string): ToolSettingsSchema {
  const isVwap = toolType === 'anchored_vwap';

  const inputsSections: SectionDefinition[] = [
    {
      id: 'sec_profile_inputs',
      title: isVwap ? 'Anchored VWAP Inputs' : 'Volume Profile Inputs',
      fields: isVwap
        ? [
            {
              id: 'vwap_source',
              label: 'Price Source',
              widget: 'select',
              props: {
                options: [
                  { value: 'hlc3', label: 'HLC3' },
                  { value: 'close', label: 'Close' },
                  { value: 'hl2', label: 'HL2' },
                  { value: 'ohlc4', label: 'OHLC4' },
                ],
              },
              getter: (s) => s.source || 'hlc3',
              setter: (v, s) => {
                s.source = v as any;
              },
            },
          ]
        : [
            {
              id: 'va_volume_percent',
              label: 'Value Area Volume (%)',
              widget: 'number_stepper',
              props: { min: 10, max: 100, step: 5, unit: '%' },
              getter: (s) => s.valueAreaVolumePercent ?? 70,
              setter: (v, s) => {
                s.valueAreaVolumePercent = Number(v) || 70;
              },
            },
          ],
    },
  ];

  const styleSections: SectionDefinition[] = [
    {
      id: 'sec_profile_style',
      title: 'Styling & Colors',
      fields: [
        commonFields.strokeColorAndOpacity(),
        commonFields.lineWidth(),
        commonFields.lineStyle(),
      ],
    },
  ];

  return {
    toolType,
    title,
    tabs: ['inputs', 'style', 'coordinates', 'visibility'],
    defaultTab: 'inputs',
    inputsSections,
    styleSections,
    hasCoordinates: true,
    hasVisibility: true,
  };
}

// ---------------------------------------------------------------------------
// Master Schema Registry Map
// ---------------------------------------------------------------------------

const schemaRegistry = new Map<DrawingType, ToolSettingsSchema>();

function register(schema: ToolSettingsSchema): void {
  schemaRegistry.set(schema.toolType, schema);
}

// 1. Directional Lines & Vectors
register(buildDirectionalLineSchema('trend_line', 'Trend Line'));
register(buildDirectionalLineSchema('ray', 'Ray'));
register(buildDirectionalLineSchema('info_line', 'Info Line'));
register(buildDirectionalLineSchema('extended_line', 'Extended Line'));
register(buildDirectionalLineSchema('trend_angle', 'Trend Angle'));
register(buildDirectionalLineSchema('horizontal_line', 'Horizontal Line'));
register(buildDirectionalLineSchema('horizontal_ray', 'Horizontal Ray'));
register(buildDirectionalLineSchema('vertical_line', 'Vertical Line'));
register(buildDirectionalLineSchema('cross_line', 'Cross Line'));
register(buildDirectionalLineSchema('arrow', 'Arrow'));
register(buildDirectionalLineSchema('arrow_marker', 'Arrow Marker'));

// 2. Fibonacci & Gann Analytical Instruments
register(buildFibonacciSchema('fib_retracement', 'Fib Retracement'));
register(buildFibonacciSchema('fib_extension', 'Fib Extension'));
register(buildFibonacciSchema('fib_projection', 'Fib Projection'));
register(buildFibonacciSchema('fib_timezones', 'Fib Time Zones'));
register(buildFibonacciSchema('fib_channel', 'Fib Channel'));
register(buildFibonacciSchema('fib_speed_fan', 'Fib Speed Fan'));
register(buildFibonacciSchema('fib_circles', 'Fib Circles'));
register(buildFibonacciSchema('gann_fan', 'Gann Fan'));
register(buildFibonacciSchema('gann_box', 'Gann Box'));

// 3. Pitchforks & Channels
register(buildPitchforkAndChannelSchema('pitchfork', "Andrews' Pitchfork"));
register(buildPitchforkAndChannelSchema('schiff_pitchfork', 'Schiff Pitchfork'));
register(buildPitchforkAndChannelSchema('modified_schiff_pitchfork', 'Modified Schiff'));
register(buildPitchforkAndChannelSchema('inside_pitchfork', 'Inside Pitchfork'));
register(buildPitchforkAndChannelSchema('parallel_channel', 'Parallel Channel'));
register(buildPitchforkAndChannelSchema('regression_channel', 'Regression Channel'));
register(buildPitchforkAndChannelSchema('equidistant_channel', 'Equidistant Channel'));
register(buildPitchforkAndChannelSchema('flat_top_bottom', 'Flat Top/Bottom'));
register(buildPitchforkAndChannelSchema('disjoint_channel', 'Disjoint Channel'));

// 4. Geometric Shapes & Polygons
register(buildGeometricShapeSchema('rectangle', 'Rectangle'));
register(buildGeometricShapeSchema('rotated_rectangle', 'Rotated Rectangle'));
register(buildGeometricShapeSchema('ellipse', 'Ellipse'));
register(buildGeometricShapeSchema('circle', 'Circle'));
register(buildGeometricShapeSchema('triangle', 'Triangle'));
register(buildGeometricShapeSchema('polyline', 'Polyline'));
register(buildGeometricShapeSchema('path', 'Path'));
register(buildGeometricShapeSchema('curve', 'Curve'));
register(buildGeometricShapeSchema('arc', 'Arc'));

// 5. Freehand Vector Strokes
register(buildFreehandSchema('brush', 'Brush'));
register(buildFreehandSchema('highlighter', 'Highlighter'));
register(buildFreehandSchema('pencil', 'Pencil'));
register(buildFreehandSchema('pen', 'Pen'));

// 6. Annotations, Badges & Labels
register(buildAnnotationSchema('text', 'Text'));
register(buildAnnotationSchema('anchored_text', 'Anchored Text'));
register(buildAnnotationSchema('note', 'Note'));
register(buildAnnotationSchema('anchored_note', 'Anchored Note'));
register(buildAnnotationSchema('signpost', 'Signpost'));
register(buildAnnotationSchema('callout', 'Callout'));
register(buildAnnotationSchema('balloon', 'Balloon'));
register(buildAnnotationSchema('price_label', 'Price Label'));
register(buildAnnotationSchema('price_note', 'Price Note'));
register(buildAnnotationSchema('date_label', 'Date Label'));

// 7. Measurement, Risk/Reward & Positions
register(buildMeasurementSchema('price_range', 'Price Range'));
register(buildMeasurementSchema('date_range', 'Date Range'));
register(buildMeasurementSchema('date_and_price_range', 'Date and Price Range'));
register(buildMeasurementSchema('bars_count', 'Bars Count'));
register(buildMeasurementSchema('measurement', 'Measurement Box'));
register(buildPositionSchema('long_position', 'Long Position'));
register(buildPositionSchema('short_position', 'Short Position'));
register(buildPositionSchema('forecast', 'Forecast'));
register(buildPositionSchema('projection', 'Projection'));
register(buildMeasurementSchema('bars_pattern', 'Bars Pattern'));
register(buildMeasurementSchema('ghost_feed', 'Ghost Feed'));

// 8. Chart Patterns & Harmonic Ratios
register(buildPatternSchema('head_and_shoulders', 'Head and Shoulders'));
register(buildPatternSchema('xabcd_pattern', 'XABCD Harmonic Pattern'));
register(buildPatternSchema('cypher_pattern', 'Cypher Pattern'));
register(buildPatternSchema('abcd_pattern', 'ABCD Pattern'));
register(buildPatternSchema('triangle_pattern', 'Triangle Pattern'));
register(buildPatternSchema('three_drives', 'Three Drives Pattern'));
register(buildPatternSchema('elliott_impulse', 'Elliott Impulse Wave (12345)'));
register(buildPatternSchema('elliott_correction', 'Elliott Correction Wave (ABC)'));
register(buildPatternSchema('elliott_triangle', 'Elliott Triangle Wave (ABCDE)'));
register(buildPatternSchema('elliott_triple_combo', 'Elliott Triple Combo (WXYXZ)'));
register(buildPatternSchema('elliott_double_combo', 'Elliott Double Combo (WXY)'));
register(buildPatternSchema('cyclic_lines', 'Cyclic Lines'));
register(buildPatternSchema('time_cycles', 'Time Cycles'));
register(buildPatternSchema('sine_line', 'Sine Line'));

// 9. Volume & Anchored Analysis
register(buildVolumeAndProfileSchema('anchored_vwap', 'Anchored VWAP'));
register(buildVolumeAndProfileSchema('fixed_range_volume_profile', 'Fixed Range Volume Profile'));

// ---------------------------------------------------------------------------
// Public API Functions
// ---------------------------------------------------------------------------

export function getToolSettingsSchema(toolType: DrawingType): ToolSettingsSchema {
  const schema = schemaRegistry.get(toolType);
  if (schema) return schema;

  // Fallback generic schema for unlisted / custom tools
  const formattedTitle = toolType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    toolType,
    title: formattedTitle,
    tabs: ['style', 'coordinates', 'visibility'],
    defaultTab: 'style',
    styleSections: [
      {
        id: 'sec_generic_style',
        title: 'Style Appearance',
        fields: [
          commonFields.strokeColorAndOpacity(),
          commonFields.lineWidth(),
          commonFields.lineStyle(),
          commonFields.fillBackground(),
          commonFields.fillColorAndOpacity(),
        ],
      },
    ],
    hasCoordinates: true,
    hasVisibility: true,
  };
}

export function registerToolSettingsSchema(schema: ToolSettingsSchema): void {
  schemaRegistry.set(schema.toolType, schema);
}

export function getAllToolSettingsSchemas(): Map<DrawingType, ToolSettingsSchema> {
  return new Map(schemaRegistry);
}

export function hasSettingsTab(toolType: DrawingType, tab: SettingsTabId): boolean {
  const schema = getToolSettingsSchema(toolType);
  return schema.tabs.includes(tab);
}

