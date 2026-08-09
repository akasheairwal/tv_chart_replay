/**
 * Application shell. In Wave 0 this renders the workspace frame and
 * reports bridge status; later waves add the chart, replay controls and
 * the drawing engine.
 */
import type { PythonBridge } from './bridge/python-bridge';
import { ChartManager } from './chart/chart-manager';

export class App {
  private readonly bridge: PythonBridge | null;
  private readonly chart: ChartManager;

  constructor(bridge: PythonBridge | null) {
    this.bridge = bridge;
    const container = document.querySelector<HTMLElement>('#chart-container');
    if (!container) throw new Error('Missing #chart-container element');
    this.chart = new ChartManager(container);
  }

  start(): void {
    this.chart.init();
    if (this.bridge) {
      this.bridge.onEvent('system.ready', () => {
        /* Wave 1 will surface real events here. */
      });
    }
  }
}