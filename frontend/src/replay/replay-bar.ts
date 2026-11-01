import type { ReplayController, ReplayState } from './replay-controller';
import type { FormationMode } from './sub-tick-generator';
import { getIcon } from '../ui/icons';

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];

export class ReplayBar {
  private playBtn!: HTMLButtonElement;
  private stepBackBtn!: HTMLButtonElement;
  private stepFwdBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private randomBtn!: HTMLButtonElement;
  private speedSelect!: HTMLSelectElement;
  private modeSelect!: HTMLSelectElement;
  private modeBadge!: HTMLElement;
  private lastMode: FormationMode | null = null;
  private jumpInput!: HTMLInputElement;
  private jumpBtn!: HTMLButtonElement;
  private counterEl!: HTMLElement;
  private statusBadge!: HTMLElement;
  private lastStatus: string | null = null;
  private lastCounterText = '';
  private lastSpeed = -1;

  constructor(
    private readonly container: HTMLElement,
    private readonly controller: ReplayController,
    private readonly onRandomReplay: () => void,
    private readonly onJumpToDate?: (target_s: number) => void,
  ) {
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'replay-bar tv-replay-theme';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'replay-group left-group';

    this.randomBtn = document.createElement('button');
    this.randomBtn.className = 'replay-btn replay-random-btn';
    this.randomBtn.innerHTML = `${getIcon('lightning')} <span>Random</span>`;
    this.randomBtn.title = 'Random Replay Start (R)';
    this.randomBtn.addEventListener('click', () => this.onRandomReplay());

    this.resetBtn = document.createElement('button');
    this.resetBtn.className = 'replay-btn';
    this.resetBtn.innerHTML = `${getIcon('step_back')}`;
    this.resetBtn.title = 'Reset to Start (Home)';
    this.resetBtn.addEventListener('click', () => void this.controller.reset());

    this.stepBackBtn = document.createElement('button');
    this.stepBackBtn.className = 'replay-btn';
    this.stepBackBtn.innerHTML = `${getIcon('step_back')} <span>Step</span>`;
    this.stepBackBtn.title = 'Step Backward (Left Arrow)';
    this.stepBackBtn.addEventListener('click', () => void this.controller.stepBackward(1));

    this.playBtn = document.createElement('button');
    this.playBtn.className = 'replay-btn replay-play-btn';
    this.playBtn.innerHTML = `${getIcon('play')} <span>Play</span>`;
    this.playBtn.title = 'Play / Pause (Space)';
    this.playBtn.addEventListener('click', (e) => {
      e.preventDefault();
      void this.controller.togglePlayPause();
    });

    this.stepFwdBtn = document.createElement('button');
    this.stepFwdBtn.className = 'replay-btn';
    this.stepFwdBtn.innerHTML = `<span>Step</span> ${getIcon('step_forward')}`;
    this.stepFwdBtn.title = 'Step Forward (Right Arrow)';
    this.stepFwdBtn.addEventListener('click', () => void this.controller.stepForward(1));

    leftGroup.append(
      this.randomBtn,
      this.resetBtn,
      this.stepBackBtn,
      this.playBtn,
      this.stepFwdBtn,
    );

    const rightGroup = document.createElement('div');
    rightGroup.className = 'replay-group right-group';

    const speedWrap = document.createElement('div');
    speedWrap.className = 'replay-speed-wrap';
    speedWrap.innerHTML = `<span class="replay-speed-icon">${getIcon('speed')}</span>`;

    this.speedSelect = document.createElement('select');
    this.speedSelect.className = 'replay-speed-select';
    for (const spd of REPLAY_SPEEDS) {
      const opt = document.createElement('option');
      opt.value = spd.toString();
      opt.textContent = `${spd}x`;
      if (spd === 1) opt.selected = true;
      this.speedSelect.appendChild(opt);
    }
    this.speedSelect.addEventListener('change', () => {
      void this.controller.setSpeed(parseFloat(this.speedSelect.value));
    });
    speedWrap.appendChild(this.speedSelect);

    const modeWrap = document.createElement('div');
    modeWrap.className = 'replay-mode-wrap';
    modeWrap.title = 'Candle Formation Simulation Mode';
    modeWrap.innerHTML = `<span class="replay-mode-icon">${getIcon('activity')}</span>`;

    this.modeSelect = document.createElement('select');
    this.modeSelect.className = 'replay-mode-select';
    this.modeSelect.title = 'Candle Formation Simulation Mode';
    const MODES: Array<{ value: FormationMode; label: string }> = [
      { value: 'ltf', label: 'Real LTF' },
      { value: 'orderflow', label: 'Order Flow' },
      { value: 'instant', label: 'Instant' },
    ];
    for (const m of MODES) {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      if (m.value === this.controller.formationMode) opt.selected = true;
      this.modeSelect.appendChild(opt);
    }
    this.modeSelect.addEventListener('change', () => {
      this.controller.setFormationMode(this.modeSelect.value as FormationMode);
      this.updateFormationBadge();
    });
    modeWrap.appendChild(this.modeSelect);

    this.modeBadge = document.createElement('span');
    this.modeBadge.className = 'replay-mode-status-badge';
    modeWrap.appendChild(this.modeBadge);
    this.updateFormationBadge();

    this.jumpInput = document.createElement('input');
    this.jumpInput.type = 'datetime-local';
    this.jumpInput.className = 'replay-jump-input';
    this.jumpInput.title = 'Select target date and time to jump replay';

    this.jumpBtn = document.createElement('button');
    this.jumpBtn.className = 'replay-btn replay-jump-btn';
    this.jumpBtn.innerHTML = `${getIcon('jump')} <span>Jump</span>`;
    this.jumpBtn.title = 'Jump replay playback to selected date & time';
    this.jumpBtn.addEventListener('click', () => {
      if (!this.jumpInput.value) return;
      const targetTs = Math.floor(new Date(this.jumpInput.value).getTime() / 1000);
      if (!isNaN(targetTs) && targetTs > 0) {
        if (this.onJumpToDate) {
          this.onJumpToDate(targetTs);
        } else {
          void this.controller.jumpTo(targetTs);
        }
      }
    });

    this.counterEl = document.createElement('span');
    this.counterEl.className = 'replay-counter';
    this.counterEl.textContent = 'Replay: Idle';

    this.statusBadge = document.createElement('span');
    this.statusBadge.className = 'replay-badge badge-paused';
    this.statusBadge.textContent = 'IDLE';

    rightGroup.append(
      speedWrap,
      modeWrap,
      this.jumpInput,
      this.jumpBtn,
      this.counterEl,
      this.statusBadge,
    );

    this.container.append(leftGroup, rightGroup);
  }

  update(state: ReplayState): void {
    if (state.status !== this.lastStatus) {
      this.lastStatus = state.status;
      if (state.status === 'PLAYING') {
        this.playBtn.innerHTML = `${getIcon('pause')} <span>Pause</span>`;
        this.playBtn.classList.add('playing');
        this.playBtn.title = 'Pause (Space)';
        this.statusBadge.className = 'replay-badge badge-playing';
        this.statusBadge.textContent = 'PLAYING';
      } else if (state.status === 'FINISHED') {
        this.playBtn.innerHTML = `${getIcon('play')} <span>Replay</span>`;
        this.playBtn.classList.remove('playing');
        this.playBtn.title = 'Replay from start (Space)';
        this.statusBadge.className = 'replay-badge badge-finished';
        this.statusBadge.textContent = 'FINISHED';
      } else {
        this.playBtn.innerHTML = `${getIcon('play')} <span>Play</span>`;
        this.playBtn.classList.remove('playing');
        this.playBtn.title = 'Play (Space)';
        this.statusBadge.className = 'replay-badge badge-paused';
        this.statusBadge.textContent = 'PAUSED';
      }
    }

    if (state.current_timestamp && state.current_timestamp > 0) {
      const dt = new Date(state.current_timestamp * 1000);
      const isoStr = dt.toISOString().slice(0, 16);
      if (document.activeElement !== this.jumpInput && this.jumpInput.value !== isoStr) {
        this.jumpInput.value = isoStr;
      }
    }

    const counterText = `Bar ${state.current_index + 1} / ${state.total_candles} (${state.symbol} · ${state.timeframe})`;
    if (counterText !== this.lastCounterText) {
      this.counterEl.textContent = counterText;
      this.lastCounterText = counterText;
    }

    if (state.speed !== this.lastSpeed) {
      this.speedSelect.value = state.speed.toString();
      this.lastSpeed = state.speed;
    }

    if (this.controller.formationMode !== this.lastMode) {
      this.modeSelect.value = this.controller.formationMode;
      this.lastMode = this.controller.formationMode;
    }

    this.updateFormationBadge();
  }

  private updateFormationBadge(): void {
    if (!this.modeBadge) return;
    const info = this.controller.getFormationStatus();

    if (info.mode === 'ltf') {
      if (info.isFallback) {
        this.modeBadge.className = 'replay-mode-status-badge badge-ltf-fallback';
        this.modeBadge.textContent = 'Fallback: Order Flow';
        this.modeBadge.title = `Real LTF Fallback: ${info.reason || 'No LTF data available'}. Automatically using Order Flow tape simulation.`;
      } else if (info.ltfBarsCount > 1) {
        this.modeBadge.className = 'replay-mode-status-badge badge-ltf-active';
        this.modeBadge.textContent = `${info.ltfBarsCount} bars (${info.ltfTimeframe || 'LTF'})`;
        this.modeBadge.title = `Real LTF Active: Replaying ${info.ltfBarsCount} historical ${info.ltfTimeframe || 'LTF'} bars for this candle.`;
      } else if (info.ltfTimeframe) {
        this.modeBadge.className = 'replay-mode-status-badge badge-ltf-active';
        this.modeBadge.textContent = `Ready (${info.ltfTimeframe})`;
        this.modeBadge.title = `Real LTF: Ready with historical ${info.ltfTimeframe} data.`;
      } else {
        this.modeBadge.className = 'replay-mode-status-badge badge-ltf-fallback';
        this.modeBadge.textContent = info.recommendedLTF ? `No ${info.recommendedLTF}` : 'Base TF';
        this.modeBadge.title = info.reason || 'Real LTF: No lower-timeframe data loaded.';
      }
    } else if (info.mode === 'orderflow') {
      this.modeBadge.className = 'replay-mode-status-badge badge-orderflow';
      this.modeBadge.textContent = 'Tape Sim';
      this.modeBadge.title = 'Order Flow Mode: 4-phase institutional tape simulation & dynamic volume velocity.';
    } else {
      this.modeBadge.className = 'replay-mode-status-badge badge-instant';
      this.modeBadge.textContent = 'Instant';
      this.modeBadge.title = 'Instant Mode: Intra-bar simulation bypassed for maximum throughput.';
    }
  }
}
