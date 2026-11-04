import type { ReplayController, ReplayState } from './replay-controller';
import type { FormationMode } from './sub-tick-generator';
import { getIcon } from '../ui/icons';
import {
  positionPopoverAbove,
  attachPopoverDismissal,
  type PopoverBinding,
} from '../ui/popover-utils';

export const REPLAY_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 25, 50, 100];

function safeSetAttr(el: HTMLElement | null | undefined, name: string, value: string): void {
  if (el && typeof el.setAttribute === 'function') {
    el.setAttribute(name, value);
  }
}

function safeGetAttr(el: HTMLElement | null | undefined, name: string): string | null {
  if (el && typeof el.getAttribute === 'function') {
    return el.getAttribute(name);
  }
  return null;
}

export class ReplayBar {
  private playBtn!: HTMLButtonElement;
  private stepBackBtn!: HTMLButtonElement;
  private stepFwdBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private randomBtn!: HTMLButtonElement;
  private speedWrap!: HTMLElement;
  private speedLabel!: HTMLElement;
  private speedChevron!: HTMLElement;
  private speedSelect!: HTMLSelectElement;
  private speedPopupEl: HTMLElement | null = null;
  private currentSpeed = 1;
  private speedPopoverBinding: PopoverBinding | null = null;
  private jumpPopupEl: HTMLElement | null = null;
  private jumpPopoverBinding: PopoverBinding | null = null;
  private currentTimestamp = 0;
  private boundGlobalKey: ((e: KeyboardEvent) => void) | null = null;
  private modeWrap!: HTMLElement;
  private modeDot!: HTMLElement;
  private modeLabel!: HTMLElement;
  private modeChevron!: HTMLElement;
  private formationPopupEl: HTMLElement | null = null;
  private formationPopoverBinding: PopoverBinding | null = null;
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

    this.boundGlobalKey = (e: KeyboardEvent) => {
      if ((e.key === 'j' || e.key === 'J') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const target = e.target as HTMLElement | null;
        const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (!isInput) {
          e.preventDefault();
          this.toggleJumpPopup();
        }
      }
    };
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('keydown', this.boundGlobalKey);
    }
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'replay-bar tv-replay-theme';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'replay-group left-group transport-group';

    this.resetBtn = document.createElement('button');
    this.resetBtn.className = 'replay-btn replay-reset-btn';
    this.resetBtn.innerHTML = getIcon('reset_start');
    this.resetBtn.title = 'Reset to Start (Home)';
    this.resetBtn.addEventListener('click', () => void this.controller.reset());

    this.stepBackBtn = document.createElement('button');
    this.stepBackBtn.className = 'replay-btn replay-step-back-btn';
    this.stepBackBtn.innerHTML = getIcon('single_step_back');
    this.stepBackBtn.title = 'Step Backward (Left Arrow)';
    this.stepBackBtn.addEventListener('click', () => void this.controller.stepBackward(1));

    this.playBtn = document.createElement('button');
    this.playBtn.className = 'replay-btn replay-play-btn';
    this.playBtn.innerHTML = getIcon('play');
    this.playBtn.title = 'Play / Pause (Space)';
    this.playBtn.addEventListener('click', (e) => {
      e.preventDefault();
      void this.controller.togglePlayPause();
    });

    this.stepFwdBtn = document.createElement('button');
    this.stepFwdBtn.className = 'replay-btn replay-step-fwd-btn';
    this.stepFwdBtn.innerHTML = getIcon('single_step_forward');
    this.stepFwdBtn.title = 'Step Forward (Right Arrow)';
    this.stepFwdBtn.addEventListener('click', () => void this.controller.stepForward(1));

    this.randomBtn = document.createElement('button');
    this.randomBtn.className = 'replay-btn replay-random-btn';
    this.randomBtn.innerHTML = getIcon('lightning');
    this.randomBtn.title = 'Random Replay Start (R)';
    this.randomBtn.addEventListener('click', () => this.onRandomReplay());

    leftGroup.append(
      this.resetBtn,
      this.stepBackBtn,
      this.playBtn,
      this.stepFwdBtn,
      this.randomBtn,
    );

    const speedWrap = document.createElement('div');
    speedWrap.className = 'replay-speed-wrap';
    safeSetAttr(speedWrap, 'role', 'button');
    safeSetAttr(speedWrap, 'tabindex', '0');
    safeSetAttr(speedWrap, 'aria-haspopup', 'true');
    safeSetAttr(speedWrap, 'aria-expanded', 'false');
    speedWrap.title = 'Playback Speed (Current: 1x)';

    const speedIcon = document.createElement('span');
    speedIcon.className = 'replay-speed-icon';
    speedIcon.innerHTML = getIcon('speed');

    this.speedLabel = document.createElement('span');
    this.speedLabel.className = 'replay-speed-label';
    this.speedLabel.textContent = `${this.currentSpeed}x`;

    this.speedChevron = document.createElement('span');
    this.speedChevron.className = 'replay-speed-chevron';
    this.speedChevron.innerHTML = getIcon('chevron_down');

    // Kept in DOM for compatibility with any tests or external readers
    this.speedSelect = document.createElement('select');
    this.speedSelect.className = 'replay-speed-select';
    if (this.speedSelect.style) {
      this.speedSelect.style.display = 'none';
    }
    safeSetAttr(this.speedSelect, 'tabindex', '-1');
    safeSetAttr(this.speedSelect, 'aria-hidden', 'true');
    for (const spd of REPLAY_SPEEDS) {
      const opt = document.createElement('option');
      opt.value = spd.toString();
      opt.textContent = `${spd}x`;
      if (spd === 1) opt.selected = true;
      this.speedSelect.appendChild(opt);
    }
    this.speedSelect.value = this.currentSpeed.toString();
    this.speedSelect.addEventListener('change', () => {
      this.selectSpeed(parseFloat(this.speedSelect.value));
    });

    speedWrap.append(speedIcon, this.speedLabel, this.speedChevron, this.speedSelect);
    this.speedWrap = speedWrap;

    this.speedWrap.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSpeedPopup();
    });

    this.speedWrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.toggleSpeedPopup();
      }
    });

    const modeWrap = document.createElement('div');
    modeWrap.className = 'replay-mode-wrap';
    safeSetAttr(modeWrap, 'role', 'button');
    safeSetAttr(modeWrap, 'tabindex', '0');
    safeSetAttr(modeWrap, 'aria-haspopup', 'true');
    safeSetAttr(modeWrap, 'aria-expanded', 'false');
    modeWrap.title = 'Candle Formation Simulation Mode';

    this.modeDot = document.createElement('span');
    this.modeDot.className = 'replay-mode-dot ltf-active';

    this.modeLabel = document.createElement('span');
    this.modeLabel.className = 'replay-mode-label';
    this.modeLabel.textContent = 'Real LTF';

    this.modeChevron = document.createElement('span');
    this.modeChevron.className = 'replay-mode-chevron';
    this.modeChevron.innerHTML = getIcon('chevron_down');

    this.modeSelect = document.createElement('select');
    this.modeSelect.className = 'replay-mode-select';
    this.modeSelect.title = 'Candle Formation Simulation Mode';
    if (this.modeSelect.style) {
      this.modeSelect.style.display = 'none';
    }
    safeSetAttr(this.modeSelect, 'tabindex', '-1');
    safeSetAttr(this.modeSelect, 'aria-hidden', 'true');
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

    this.modeBadge = document.createElement('span');
    this.modeBadge.className = 'replay-mode-status-badge';
    if (this.modeBadge.style) {
      this.modeBadge.style.display = 'none';
    }

    modeWrap.append(
      this.modeDot,
      this.modeLabel,
      this.modeChevron,
      this.modeSelect,
      this.modeBadge,
    );
    this.modeWrap = modeWrap;

    this.modeWrap.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFormationPopup();
    });

    this.modeWrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.toggleFormationPopup();
      }
    });

    this.updateFormationBadge();

    const centerGroup = document.createElement('div');
    centerGroup.className = 'replay-group center-group timeline-group';

    this.jumpInput = document.createElement('input');
    this.jumpInput.type = 'datetime-local';
    this.jumpInput.className = 'replay-jump-input';
    if (this.jumpInput.style) {
      this.jumpInput.style.display = 'none';
    }
    this.jumpInput.title = 'Select target date and time to jump replay';

    this.jumpBtn = document.createElement('button');
    this.jumpBtn.className = 'replay-btn replay-jump-btn';
    safeSetAttr(this.jumpBtn, 'role', 'button');
    safeSetAttr(this.jumpBtn, 'aria-haspopup', 'true');
    safeSetAttr(this.jumpBtn, 'aria-expanded', 'false');
    this.jumpBtn.innerHTML = `${getIcon('jump')} <span class="replay-btn-text">Jump</span>`;
    this.jumpBtn.title = 'Jump to Date or Bar (J)';
    this.jumpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleJumpPopup();
    });

    this.counterEl = document.createElement('span');
    this.counterEl.className = 'replay-counter';
    this.counterEl.textContent = 'Replay: Idle';

    this.statusBadge = document.createElement('span');
    this.statusBadge.className = 'replay-badge badge-paused';
    this.statusBadge.textContent = 'IDLE';

    centerGroup.append(
      this.jumpInput,
      this.jumpBtn,
      this.counterEl,
      this.statusBadge,
    );

    const rightGroup = document.createElement('div');
    rightGroup.className = 'replay-group right-group engine-group';

    rightGroup.append(
      speedWrap,
      modeWrap,
    );

    this.container.append(leftGroup, centerGroup, rightGroup);
  }

  update(state: ReplayState): void {
    if (state.status !== this.lastStatus) {
      this.lastStatus = state.status;
      if (state.status === 'PLAYING') {
        this.playBtn.innerHTML = getIcon('pause');
        this.playBtn.classList.add('playing');
        this.playBtn.title = 'Pause (Space)';
        this.statusBadge.className = 'replay-badge badge-playing';
        this.statusBadge.textContent = 'PLAYING';
      } else if (state.status === 'FINISHED') {
        this.playBtn.innerHTML = getIcon('play');
        this.playBtn.classList.remove('playing');
        this.playBtn.title = 'Replay from start (Space)';
        this.statusBadge.className = 'replay-badge badge-finished';
        this.statusBadge.textContent = 'FINISHED';
      } else {
        this.playBtn.innerHTML = getIcon('play');
        this.playBtn.classList.remove('playing');
        this.playBtn.title = 'Play (Space)';
        this.statusBadge.className = 'replay-badge badge-paused';
        this.statusBadge.textContent = 'PAUSED';
      }
    }

    if (state.current_timestamp && state.current_timestamp > 0) {
      this.currentTimestamp = state.current_timestamp;
      const dt = new Date(state.current_timestamp * 1000);
      const isoStr = dt.toISOString().slice(0, 16);
      if (document.activeElement !== this.jumpInput && this.jumpInput.value !== isoStr) {
        this.jumpInput.value = isoStr;
      }
    }

    const currentBar = (state.current_index ?? -1) >= 0 ? state.current_index + 1 : 0;
    const totalBars = state.total_candles ?? 0;
    const counterText = `${currentBar.toLocaleString()} / ${totalBars.toLocaleString()} bars`;
    if (counterText !== this.lastCounterText) {
      this.counterEl.textContent = counterText;
      this.counterEl.title = `Replay Progress: ${currentBar.toLocaleString()} of ${totalBars.toLocaleString()} candles (${state.symbol || ''} · ${state.timeframe || ''})`;
      this.lastCounterText = counterText;
    }

    if (state.speed !== this.lastSpeed) {
      this.lastSpeed = state.speed;
      this.currentSpeed = state.speed;
      this.speedLabel.textContent = `${state.speed}x`;
      this.speedWrap.title = `Playback Speed (Current: ${state.speed}x)`;
      this.speedSelect.value = state.speed.toString();

      // If popup is currently open, dynamically update checkmarks and active highlight
      if (this.speedPopupEl) {
        const items = this.speedPopupEl.querySelectorAll<HTMLElement>('.tv-speed-item');
        items.forEach((item) => {
          const spd = parseFloat(safeGetAttr(item, 'data-speed') || '0');
          const isActive = Math.abs(spd - state.speed) < 0.001;
          item.classList.toggle('active', isActive);
          safeSetAttr(item, 'aria-checked', isActive ? 'true' : 'false');
          const checkEl = item.querySelector('.tv-speed-check');
          if (checkEl) {
            checkEl.innerHTML = isActive ? getIcon('check') : '';
          }
        });
      }
    }

    if (this.controller.formationMode !== this.lastMode) {
      this.modeSelect.value = this.controller.formationMode;
      this.lastMode = this.controller.formationMode;
    }

    this.updateFormationBadge();
  }

  public toggleSpeedPopup(): void {
    if (this.speedPopupEl) {
      this.closeSpeedPopup();
    } else {
      this.openSpeedPopup();
    }
  }

  public openSpeedPopup(): void {
    if (this.speedPopupEl) return;

    const popup = document.createElement('div');
    popup.className = 'tv-speed-popup';
    safeSetAttr(popup, 'role', 'menu');
    safeSetAttr(popup, 'aria-label', 'Replay Speed Presets');

    const header = document.createElement('div');
    header.className = 'tv-speed-header';
    header.innerHTML = '<span>Playback Speed</span>';
    popup.appendChild(header);

    const listWrap = document.createElement('div');
    listWrap.className = 'tv-speed-list';

    for (const spd of REPLAY_SPEEDS) {
      const isActive = Math.abs(spd - this.currentSpeed) < 0.001;
      const item = document.createElement('div');
      item.className = `tv-speed-item ${isActive ? 'active' : ''}`;
      safeSetAttr(item, 'role', 'menuitemradio');
      safeSetAttr(item, 'aria-checked', isActive ? 'true' : 'false');
      safeSetAttr(item, 'data-speed', spd.toString());

      const checkSpan = document.createElement('span');
      checkSpan.className = 'tv-speed-check';
      checkSpan.innerHTML = isActive ? getIcon('check') : '';

      const numSpan = document.createElement('span');
      numSpan.className = 'tv-speed-text';
      numSpan.textContent = `${spd}x`;

      const descSpan = document.createElement('span');
      descSpan.className = 'tv-speed-desc';
      descSpan.textContent = this.getSpeedDescription(spd);

      item.append(checkSpan, numSpan, descSpan);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectSpeed(spd);
      });

      listWrap.appendChild(item);
    }
    popup.appendChild(listWrap);

    document.body.appendChild(popup);
    this.speedPopupEl = popup;
    this.speedWrap.classList.add('open');
    safeSetAttr(this.speedWrap, 'aria-expanded', 'true');

    this.positionSpeedPopup();

    this.speedPopoverBinding = attachPopoverDismissal({
      popupEl: popup,
      anchorEl: this.speedWrap,
      onDismiss: () => this.closeSpeedPopup(),
      onReposition: () => this.positionSpeedPopup(),
      restoreFocus: true,
    });
  }

  private positionSpeedPopup(): void {
    if (!this.speedPopupEl) return;
    positionPopoverAbove(this.speedWrap, this.speedPopupEl, {
      viewportPadding: 8,
      offsetY: 6,
      fallbackWidth: 180,
    });
  }

  public closeSpeedPopup(): void {
    if (!this.speedPopupEl) return;
    this.speedPopupEl.remove();
    this.speedPopupEl = null;
    this.speedWrap.classList.remove('open');
    safeSetAttr(this.speedWrap, 'aria-expanded', 'false');

    if (this.speedPopoverBinding) {
      this.speedPopoverBinding.destroy();
      this.speedPopoverBinding = null;
    }
  }

  public selectSpeed(speed: number): void {
    this.currentSpeed = speed;
    this.lastSpeed = speed;
    this.speedLabel.textContent = `${speed}x`;
    this.speedWrap.title = `Playback Speed (Current: ${speed}x)`;
    this.speedSelect.value = speed.toString();
    this.closeSpeedPopup();
    void this.controller.setSpeed(speed);
  }

  public getSpeedDescription(spd: number): string {
    if (spd < 1) {
      const sec = Math.round(1 / spd);
      return `1 bar / ${sec}s`;
    }
    if (spd === 1) {
      return '1 bar / 1s';
    }
    return `${spd} bars / 1s`;
  }

  public isSpeedPopupOpen(): boolean {
    return this.speedPopupEl !== null;
  }

  public toggleJumpPopup(): void {
    if (this.jumpPopupEl) {
      this.closeJumpPopup();
    } else {
      this.openJumpPopup();
    }
  }

  public isJumpPopupOpen(): boolean {
    return this.jumpPopupEl !== null;
  }

  public openJumpPopup(): void {
    if (this.jumpPopupEl) return;
    this.closeSpeedPopup();

    const popup = document.createElement('div');
    popup.className = 'tv-jump-popup';
    safeSetAttr(popup, 'role', 'dialog');
    safeSetAttr(popup, 'aria-label', 'Jump Replay to Date');

    // 1. Header
    const header = document.createElement('div');
    header.className = 'tv-jump-header';
    header.innerHTML = `
      <div class="tv-jump-title">
        <span class="tv-jump-title-icon">${getIcon('jump')}</span>
        <span>Jump to Date & Time</span>
      </div>
    `;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tv-jump-close-btn';
    closeBtn.type = 'button';
    closeBtn.title = 'Close (Esc)';
    closeBtn.innerHTML = getIcon('close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeJumpPopup();
    });
    header.appendChild(closeBtn);
    popup.appendChild(header);

    // 2. Presets Section
    const presetsSection = document.createElement('div');
    presetsSection.className = 'tv-jump-presets-section';
    const presetsLabel = document.createElement('div');
    presetsLabel.className = 'tv-jump-section-label';
    presetsLabel.textContent = 'Quick Presets';
    presetsSection.appendChild(presetsLabel);

    const presetsList = document.createElement('div');
    presetsList.className = 'tv-jump-presets-list';

    const presets: Array<{ label: string; deltaSeconds?: number; isStart?: boolean }> = [
      { label: '-1 Day', deltaSeconds: -86400 },
      { label: '-1 Week', deltaSeconds: -7 * 86400 },
      { label: '-1 Month', deltaSeconds: -30 * 86400 },
      { label: 'Session Start', isStart: true },
    ];

    for (const p of presets) {
      const btn = document.createElement('button');
      btn.className = 'tv-jump-preset-btn';
      btn.type = 'button';
      btn.textContent = p.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (p.isStart) {
          void this.controller.reset();
          this.closeJumpPopup();
          return;
        }
        const base = this.currentTimestamp || Math.floor(Date.now() / 1000);
        const targetTs = Math.max(0, base + (p.deltaSeconds ?? 0));
        this.executeJump(targetTs);
      });
      presetsList.appendChild(btn);
    }
    presetsSection.appendChild(presetsList);
    popup.appendChild(presetsSection);

    // 3. Date & Time Input Section
    const inputSection = document.createElement('div');
    inputSection.className = 'tv-jump-input-section';

    const inputLabel = document.createElement('div');
    inputLabel.className = 'tv-jump-section-label';
    inputLabel.textContent = 'Target Date & Time';
    inputSection.appendChild(inputLabel);

    const inputWrap = document.createElement('div');
    inputWrap.className = 'tv-jump-input-wrap';

    this.jumpInput.className = 'tv-jump-popup-input replay-jump-input';
    if (this.jumpInput.style) {
      this.jumpInput.style.display = 'block';
    }
    if (this.currentTimestamp > 0 && !this.jumpInput.value) {
      this.jumpInput.value = this.formatDatetimeValue(this.currentTimestamp);
    }

    this.jumpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleJumpSubmit();
      }
    });

    inputWrap.appendChild(this.jumpInput);
    inputSection.appendChild(inputWrap);
    popup.appendChild(inputSection);

    // 4. Action Buttons Footer
    const footer = document.createElement('div');
    footer.className = 'tv-jump-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'tv-jump-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeJumpPopup();
    });

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'tv-jump-submit-btn';
    submitBtn.innerHTML = `${getIcon('jump')} <span>Jump</span>`;
    submitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleJumpSubmit();
    });

    footer.append(cancelBtn, submitBtn);
    popup.appendChild(footer);

    document.body.appendChild(popup);
    this.jumpPopupEl = popup;
    this.jumpBtn.classList.add('open');
    safeSetAttr(this.jumpBtn, 'aria-expanded', 'true');

    this.positionJumpPopup();

    this.jumpPopoverBinding = attachPopoverDismissal({
      popupEl: popup,
      anchorEl: this.jumpBtn,
      onDismiss: () => this.closeJumpPopup(),
      onReposition: () => this.positionJumpPopup(),
      restoreFocus: true,
    });
  }

  private positionJumpPopup(): void {
    if (!this.jumpPopupEl) return;
    positionPopoverAbove(this.jumpBtn, this.jumpPopupEl, {
      viewportPadding: 10,
      offsetY: 6,
      fallbackWidth: 270,
    });
  }

  public closeJumpPopup(): void {
    if (!this.jumpPopupEl) return;
    if (this.jumpInput && this.jumpInput.parentElement) {
      this.jumpInput.parentElement.removeChild(this.jumpInput);
      if (this.jumpInput.style) {
        this.jumpInput.style.display = 'none';
      }
      this.container.appendChild(this.jumpInput);
    }
    this.jumpPopupEl.remove();
    this.jumpPopupEl = null;
    this.jumpBtn.classList.remove('open');
    safeSetAttr(this.jumpBtn, 'aria-expanded', 'false');

    if (this.jumpPopoverBinding) {
      this.jumpPopoverBinding.destroy();
      this.jumpPopoverBinding = null;
    }
  }

  private handleJumpSubmit(): void {
    if (!this.jumpInput || !this.jumpInput.value) return;
    const targetTs = Math.floor(new Date(this.jumpInput.value).getTime() / 1000);
    if (!isNaN(targetTs) && targetTs > 0) {
      this.executeJump(targetTs);
    }
  }

  public executeJump(targetTs: number): void {
    if (isNaN(targetTs) || targetTs <= 0) return;
    this.closeJumpPopup();
    if (this.onJumpToDate) {
      this.onJumpToDate(targetTs);
    } else {
      void this.controller.jumpTo(targetTs);
    }
  }

  private formatDatetimeValue(tsSeconds: number): string {
    const dt = new Date(tsSeconds * 1000);
    return dt.toISOString().slice(0, 16);
  }

  public toggleFormationPopup(): void {
    if (this.formationPopupEl) {
      this.closeFormationPopup();
    } else {
      this.openFormationPopup();
    }
  }

  public isFormationPopupOpen(): boolean {
    return this.formationPopupEl !== null;
  }

  public openFormationPopup(): void {
    if (this.formationPopupEl) return;
    this.closeSpeedPopup();
    this.closeJumpPopup();

    const popup = document.createElement('div');
    popup.className = 'tv-formation-popup';
    safeSetAttr(popup, 'role', 'dialog');
    safeSetAttr(popup, 'aria-label', 'Candle Formation Simulation Mode');

    // 1. Header
    const header = document.createElement('div');
    header.className = 'tv-formation-header';
    header.innerHTML = `
      <div class="tv-formation-title">
        <span class="tv-formation-title-icon">${getIcon('activity')}</span>
        <span>Formation Simulation</span>
      </div>
    `;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tv-formation-close-btn';
    closeBtn.type = 'button';
    closeBtn.title = 'Close (Esc)';
    closeBtn.innerHTML = getIcon('close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeFormationPopup();
    });
    header.appendChild(closeBtn);
    popup.appendChild(header);

    // 2. Mode options list
    const list = document.createElement('div');
    list.className = 'tv-formation-list';

    const currentMode = this.controller.formationMode;
    const info = this.controller.getFormationStatus();

    const items: Array<{
      mode: FormationMode;
      name: string;
      desc: string;
      diagText: string;
      diagClass: string;
    }> = [
      {
        mode: 'ltf',
        name: 'Real LTF (Multi-Timeframe)',
        desc: 'Replays authentic historical lower-timeframe candles (e.g. 1m bars inside 1H candle).',
        diagText: info.isFallback
          ? `Fallback: ${info.reason || 'No LTF data downloaded'}`
          : info.ltfBarsCount > 1
          ? `Active: ${info.ltfBarsCount} historical ${info.ltfTimeframe || 'LTF'} bars`
          : info.ltfTimeframe
          ? `Ready: ${info.ltfTimeframe} data loaded`
          : 'Ready: Base timeframe',
        diagClass: info.isFallback ? 'diag-fallback' : 'diag-active',
      },
      {
        mode: 'orderflow',
        name: 'Order Flow (Tape Simulation)',
        desc: '4-phase institutional tape algorithm with dynamic Brownian micro-tick volume velocity.',
        diagText: 'Intra-bar Micro-tick Tape Engine',
        diagClass: 'diag-active',
      },
      {
        mode: 'instant',
        name: 'Instant (Maximum Speed)',
        desc: 'Bypasses intra-bar sub-ticks for instant candle completion and rapid strategy scanning.',
        diagText: 'Intra-bar Simulation Bypassed',
        diagClass: 'diag-neutral',
      },
    ];

    for (const it of items) {
      const isActive = it.mode === currentMode;
      const itemEl = document.createElement('div');
      itemEl.className = `tv-formation-item ${isActive ? 'active' : ''}`;
      safeSetAttr(itemEl, 'role', 'button');
      safeSetAttr(itemEl, 'data-mode', it.mode);

      itemEl.innerHTML = `
        <div class="tv-formation-item-top">
          <div class="tv-formation-radio">
            <div class="tv-formation-radio-inner"></div>
          </div>
          <span class="tv-formation-name">${it.name}</span>
        </div>
        <div class="tv-formation-desc">${it.desc}</div>
        <div class="tv-formation-diag ${it.diagClass}">${it.diagText}</div>
      `;

      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectFormationMode(it.mode);
      });

      list.appendChild(itemEl);
    }

    popup.appendChild(list);

    document.body.appendChild(popup);
    this.formationPopupEl = popup;
    this.modeWrap.classList.add('open');
    safeSetAttr(this.modeWrap, 'aria-expanded', 'true');

    this.positionFormationPopup();

    this.formationPopoverBinding = attachPopoverDismissal({
      popupEl: popup,
      anchorEl: this.modeWrap,
      onDismiss: () => this.closeFormationPopup(),
      onReposition: () => this.positionFormationPopup(),
      restoreFocus: true,
    });
  }

  private positionFormationPopup(): void {
    if (!this.formationPopupEl) return;
    positionPopoverAbove(this.modeWrap, this.formationPopupEl, {
      viewportPadding: 10,
      offsetY: 6,
      fallbackWidth: 320,
    });
  }

  public closeFormationPopup(): void {
    if (!this.formationPopupEl) return;
    this.formationPopupEl.remove();
    this.formationPopupEl = null;
    this.modeWrap.classList.remove('open');
    safeSetAttr(this.modeWrap, 'aria-expanded', 'false');

    if (this.formationPopoverBinding) {
      this.formationPopoverBinding.destroy();
      this.formationPopoverBinding = null;
    }
  }

  public selectFormationMode(mode: FormationMode): void {
    this.controller.setFormationMode(mode);
    if (this.modeSelect) {
      this.modeSelect.value = mode;
    }
    this.updateFormationBadge();
    this.closeFormationPopup();
  }

  public destroy(): void {
    this.closeSpeedPopup();
    this.closeJumpPopup();
    this.closeFormationPopup();
    if (this.boundGlobalKey && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('keydown', this.boundGlobalKey);
      this.boundGlobalKey = null;
    }
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

    // Synchronize compact trigger pill elements
    if (this.modeDot && this.modeLabel) {
      if (info.mode === 'ltf') {
        this.modeDot.className = info.isFallback
          ? 'replay-mode-dot ltf-fallback'
          : 'replay-mode-dot ltf-active';
        this.modeLabel.textContent = 'Real LTF';
      } else if (info.mode === 'orderflow') {
        this.modeDot.className = 'replay-mode-dot orderflow';
        this.modeLabel.textContent = 'Tape Sim';
      } else {
        this.modeDot.className = 'replay-mode-dot instant';
        this.modeLabel.textContent = 'Instant';
      }
    }

    if (this.modeWrap && this.modeBadge) {
      this.modeWrap.title = this.modeBadge.title;
    }
  }
}
