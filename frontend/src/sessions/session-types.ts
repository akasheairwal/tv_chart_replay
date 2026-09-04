/**
 * TypeScript interfaces for Session state (Architecture §53–55).
 */

export interface ReplaySnapshot {
  start_index: number;
  current_index: number;
  end_index: number;
  speed: number;
  is_playing: boolean;
}

export interface IndicatorSnapshot {
  id: string;
  name: string;
  params: Record<string, unknown>;
  style: Record<string, unknown>;
  visible: boolean;
}

export interface SessionDefinition {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  dataset_id?: string | null;
  dataset_version?: string | null;
  replay_state: ReplaySnapshot;
  indicators: IndicatorSnapshot[];
  drawings: unknown[];
  chart_settings: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  is_autosave: boolean;
  dataset_check?: DatasetCheck;
}

export interface SessionSummary {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  updated_at: number;
  drawing_count: number;
  indicator_count: number;
  is_autosave: boolean;
  dataset_version?: string | null;
}

export interface DatasetCheck {
  status: 'ready' | 'missing' | 'mismatch' | 'unknown';
  match: boolean;
  expected_version?: string;
  current_version?: string;
  message?: string;
}

export interface BridgeEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
