/**
 * ChartGrid — multi-chart workspace layout manager (1, 2, 4, 6 charts)
 * with crosshair and master replay sync (Architecture §68–69).
 */

import { ChartManager } from './chart-manager';
import type { CompactCandleRow } from './candle-series';
import type { DrawingDefinition } from '../drawings/drawing-types';

export type LayoutType = '1' | '2v' | '2h' | '4' | '6';

export interface ChartPane {
  id: string;
  container: HTMLElement;
  chartManager: ChartManager;
  symbol: string;
  timeframe: string;
}

export class ChartGrid {
  private panes: ChartPane[] = [];
  private currentLayout: LayoutType = '1';
  private syncCrosshairEnabled = true;

  constructor(
    private readonly gridContainer: HTMLElement,
    private readonly onDrawingSave?: (drawing: DrawingDefinition) => void,
    private readonly onDrawingDelete?: (id: string) => void,
  ) {}

  setLayout(layout: LayoutType): void {
    this.currentLayout = layout;
    this.gridContainer.className = `chart-grid layout-${layout}`;
    const targetCount = layout === '1' ? 1 : layout.startsWith('2') ? 2 : layout === '4' ? 4 : 6;

    // Adjust number of panes
    while (this.panes.length < targetCount) {
      this.createPane(`pane_${this.panes.length + 1}`);
    }

    // Hide extra panes or show active ones
    this.panes.forEach((pane, idx) => {
      if (idx < targetCount) {
        pane.container.style.display = 'block';
      } else {
        pane.container.style.display = 'none';
      }
    });

    // Resize active charts
    requestAnimationFrame(() => {
      this.panes.forEach((pane, idx) => {
        if (idx < targetCount) {
          pane.chartManager.resize(
            pane.container.clientWidth,
            pane.container.clientHeight,
          );
        }
      });
    });
  }

  private createPane(id: string): ChartPane {
    const paneDiv = document.createElement('div');
    paneDiv.className = 'chart-pane';
    paneDiv.id = id;
    this.gridContainer.appendChild(paneDiv);

    const cm = new ChartManager(
      paneDiv,
      this.onDrawingSave,
      this.onDrawingDelete,
    );
    cm.init();

    const pane: ChartPane = {
      id,
      container: paneDiv,
      chartManager: cm,
      symbol: 'EURUSD',
      timeframe: '1H',
    };

    this.panes.push(pane);
    return pane;
  }

  getPrimaryChart(): ChartManager {
    if (this.panes.length === 0) {
      this.setLayout('1');
    }
    return this.panes[0].chartManager;
  }

  getPanes(): ChartPane[] {
    return this.panes;
  }

  getLayout(): LayoutType {
    return this.currentLayout;
  }

  loadHistoryOnPane(index: number, candles: CompactCandleRow[]): void {
    if (this.panes[index]) {
      this.panes[index].chartManager.loadHistory(candles);
    }
  }

  setSyncCrosshair(enabled: boolean): void {
    this.syncCrosshairEnabled = enabled;
  }

  isSyncCrosshairEnabled(): boolean {
    return this.syncCrosshairEnabled;
  }

  destroy(): void {
    this.panes.forEach((p) => p.chartManager.destroy());
    this.panes = [];
    this.gridContainer.innerHTML = '';
  }
}
