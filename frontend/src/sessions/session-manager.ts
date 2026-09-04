/**
 * Frontend Session Manager — collects, saves, loads, and auto-saves sessions
 * through the Python bridge (Architecture §53–55).
 */

import type { ActiveIndicator } from '../indicators/indicator-types';
import type { PythonBridge } from '../bridge/python-bridge';
import type { DrawingEngine } from '../drawings/drawing-engine';
import type { IndicatorManager } from '../indicators/indicator-manager';
import type { ReplayController } from '../replay/replay-controller';
import type {
  BridgeEnvelope,
  SessionDefinition,
  SessionSummary,
} from './session-types';

export interface SessionContext {
  symbol: string;
  timeframe: string;
  replayController: ReplayController;
  indicatorManager: IndicatorManager;
  drawingEngine: DrawingEngine | null;
  /** Current dataset identity, used as the version marker (§55). */
  datasetId?: string | null;
}

/** Provider for a fresh SessionContext - autosave must snapshot the LIVE
 *  state each tick, not the values captured when it was armed. */
export type SessionContextProvider = () => SessionContext;

export class SessionManager {
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly autosaveIntervalMs: number;

  constructor(
    private readonly bridge: PythonBridge | null,
    autosaveIntervalMs = 30_000, // 30 seconds
  ) {
    this.autosaveIntervalMs = autosaveIntervalMs;
  }

  // ─── Collect current UI state into a SessionDefinition ────────────────

  collectCurrentState(ctx: SessionContext, name?: string): SessionDefinition {
    const replayState = ctx.replayController.state;
    const indicators: ActiveIndicator[] = ctx.indicatorManager.getActive?.() ?? [];
    const engine = ctx.drawingEngine;
    const drawings = engine ? engine.getDrawings() : [];

    return {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name ?? `${ctx.symbol} ${ctx.timeframe} — ${new Date().toLocaleString()}`,
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
      dataset_id: ctx.datasetId ?? null,
      dataset_version: ctx.datasetId ?? null,
      replay_state: {
        start_index: replayState?.start_index ?? 0,
        current_index: replayState?.current_index ?? 0,
        end_index: replayState?.end_index ?? 0,
        speed: replayState?.speed ?? 1.0,
        is_playing: false, // always save paused
      },
      indicators: indicators.map((ind: ActiveIndicator) => ({
        id: ind.id,
        name: ind.name,
        params: ind.params ?? {},
        style: ind.colors ?? {},
        visible: ind.visible !== false,
      })),
      drawings: drawings as unknown[],
      chart_settings: {},
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      is_autosave: false,
    };
  }

  // ─── Save / Load / List / Delete ──────────────────────────────────────

  async saveSession(ctx: SessionContext, name: string): Promise<string | null> {
    if (!this.bridge) return null;
    const session = this.collectCurrentState(ctx, name);
    try {
      const res = await this.bridge.callJson<BridgeEnvelope<{ id: string }>>('saveSession', session);
      if (res.ok && res.data?.id) {
        return res.data.id;
      }
    } catch (err) {
      console.error('[sessions] saveSession failed:', err);
    }
    return null;
  }

  async loadSession(id: string): Promise<SessionDefinition | null> {
    if (!this.bridge) return null;
    try {
      const res = await this.bridge.callJson<BridgeEnvelope<SessionDefinition>>('loadSession', id);
      if (res.ok && res.data) {
        return res.data;
      }
    } catch (err) {
      console.error('[sessions] loadSession failed:', err);
    }
    return null;
  }

  async listSessions(): Promise<SessionSummary[]> {
    if (!this.bridge) return [];
    try {
      const raw = await this.bridge.call<string>('listSessions');
      const res = JSON.parse(raw) as BridgeEnvelope<SessionSummary[]>;
      if (res.ok && res.data) {
        return res.data;
      }
    } catch (err) {
      console.error('[sessions] listSessions failed:', err);
    }
    return [];
  }

  async deleteSession(id: string): Promise<boolean> {
    if (!this.bridge) return false;
    try {
      const res = await this.bridge.callJson<BridgeEnvelope<{ deleted: boolean }>>('deleteSession', id);
      return res.ok && res.data?.deleted === true;
    } catch (err) {
      console.error('[sessions] deleteSession failed:', err);
      return false;
    }
  }

  // ─── Autosave ─────────────────────────────────────────────────────────

  async saveAutosave(ctx: SessionContext): Promise<void> {
    if (!this.bridge) return;
    const session = this.collectCurrentState(ctx, 'autosave');
    session.is_autosave = true;
    try {
      await this.bridge.callJson<BridgeEnvelope<{ id: string }>>('saveAutosave', session);
    } catch {
      // Silent autosave failures are acceptable
    }
  }

  async loadAutosave(): Promise<SessionDefinition | null> {
    if (!this.bridge) return null;
    try {
      const raw = await this.bridge.call<string>('loadAutosave');
      const res = JSON.parse(raw) as BridgeEnvelope<SessionDefinition | null>;
      if (res.ok && res.data) {
        return res.data;
      }
    } catch {
      return null;
    }
    return null;
  }

  startAutosave(getContext: SessionContextProvider): void {
    this.stopAutosave();
    this.autosaveTimer = setInterval(() => {
      // Resolve the context fresh every tick so symbol switches are
      // reflected instead of persisting a stale snapshot forever.
      try {
        void this.saveAutosave(getContext());
      } catch (err) {
        console.warn('[sessions] autosave snapshot failed:', err);
      }
    }, this.autosaveIntervalMs);
  }

  stopAutosave(): void {
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  // ─── Restore Pipeline ─────────────────────────────────────────────────

  /**
   * Orchestrates a full session restore:
   * 1. Emits dataset version check warning if needed (§55)
   * 2. Restores replay index & speed
   * 3. Restores indicators
   * 4. Restores drawings on the drawing engine
   */
  async applySession(
    session: SessionDefinition,
    ctx: SessionContext,
    onDatasetMismatch?: (msg: string) => void,
  ): Promise<void> {
    // 1. Warn on dataset version drift (§55)
    if (session.dataset_check && !session.dataset_check.match) {
      const msg = session.dataset_check.message ?? `Dataset version mismatch for ${session.symbol}.`;
      console.warn('[sessions] dataset version drift:', msg);
      if (onDatasetMismatch) {
        onDatasetMismatch(msg);
      }
    }

    // 2. Restore replay index & speed
    const rs = session.replay_state;
    if (rs && ctx.replayController.state) {
      try {
        if (rs.speed && rs.speed !== ctx.replayController.currentSpeed) {
          await ctx.replayController.setSpeed(rs.speed);
        }
        if (rs.current_index > 0) {
          await ctx.replayController.jumpTo(rs.current_index);
        }
      } catch (err) {
        console.warn('[sessions] replay state restore failed:', err);
      }
    }

    // 3. Restore indicators
    try {
      for (const existing of ctx.indicatorManager.getActive()) {
        ctx.indicatorManager.removeIndicator(existing.id);
      }
      for (const snap of session.indicators ?? []) {
        const newId = await ctx.indicatorManager.addIndicator(snap.name, snap.params);
        if (newId && snap.visible === false) {
          await ctx.indicatorManager.toggleVisibility(newId);
        }
      }
    } catch (err) {
      console.warn('[sessions] indicator restore failed:', err);
    }

    // 4. Restore drawings
    if (ctx.drawingEngine && session.drawings?.length) {
      ctx.drawingEngine.setDrawings(session.drawings as Parameters<DrawingEngine['setDrawings']>[0]);
    }
  }
}
