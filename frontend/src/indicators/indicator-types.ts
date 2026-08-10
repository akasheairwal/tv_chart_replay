export interface IndicatorParamSchema {
  type: 'int' | 'float' | 'string';
  min?: number;
  max?: number;
  default: unknown;
  options?: string[];
}

export interface IndicatorMetadata {
  name: string;
  display_name: string;
  category: 'trend' | 'momentum' | 'volatility' | 'volume';
  overlay: boolean;
  default_params: Record<string, unknown>;
  param_schema: Record<string, IndicatorParamSchema>;
}

export interface IndicatorCalculationResult {
  name: string;
  display_name: string;
  overlay: boolean;
  category: string;
  timestamps: number[];
  lines: Record<string, (number | null)[]>;
}

export interface ActiveIndicator {
  id: string;
  name: string;
  display_name: string;
  overlay: boolean;
  params: Record<string, unknown>;
  visible: boolean;
  colors: Record<string, string>;
}
