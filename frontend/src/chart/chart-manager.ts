/**
 * Lightweight Charts wiring (Wave 2). Wave 0 renders a placeholder so
 * the shell and bridge can be validated end-to-end.
 */
export class ChartManager {
  constructor(private readonly container: HTMLElement) {}

  init(): void {
    const placeholder = document.createElement('div');
    placeholder.className = 'chart-placeholder';
    placeholder.textContent = 'Chart initializes in Wave 2';
    this.container.appendChild(placeholder);
  }
}