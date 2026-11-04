/**
 * Universal Popover Utilities & Viewport-Aware Positioning Engine
 *
 * Provides reusable positioning, boundary clamping, and lifecycle dismissal
 * handling (click-outside, Escape key, window resize) for TradingView-styled
 * floating popovers (Speed, Jump to Date, Candle Formation Mode).
 */

export interface PopoverPositionOptions {
  /** Padding from viewport boundaries in pixels. Default: 8 */
  viewportPadding?: number;
  /** Vertical gap between anchor and popover in pixels. Default: 6 */
  offsetY?: number;
  /** Fallback width if popupEl.offsetWidth is 0 (e.g., prior to render or in tests). Default: 180 */
  fallbackWidth?: number;
  /** Fallback height if popupEl.offsetHeight is 0. Default: 200 */
  fallbackHeight?: number;
  /** Z-index assigned to the popup element. Default: '1000' */
  zIndex?: number | string;
  /** Placement mode: 'above' (default) or 'below' */
  placement?: 'above' | 'below';
}

export interface PopoverDismissalOptions {
  popupEl: HTMLElement;
  anchorEl: HTMLElement;
  onDismiss: () => void;
  onReposition?: () => void;
  /** Whether to restore keyboard focus to the anchor element on Escape. Default: true */
  restoreFocus?: boolean;
}

export interface PopoverBinding {
  /** Manually trigger repositioning */
  reposition: () => void;
  /** Clean up event listeners and detach dismissal handlers */
  destroy: () => void;
}

/**
 * Positions a floating popover directly above or below an anchor element
 * with horizontal centering and viewport edge boundary clamping.
 */
export function positionPopoverAbove(
  anchorEl: HTMLElement,
  popupEl: HTMLElement,
  options: PopoverPositionOptions = {},
): void {
  const padding = options.viewportPadding ?? 8;
  const offsetY = options.offsetY ?? 6;
  const fallbackWidth = options.fallbackWidth ?? 180;
  const zIndex = options.zIndex !== undefined ? String(options.zIndex) : '1000';
  const placement = options.placement ?? 'above';

  const rect = anchorEl.getBoundingClientRect();
  const popupWidth = popupEl.offsetWidth || fallbackWidth;

  const winWidth = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1920;
  const winHeight = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 1080;

  // Horizontal calculation: Center relative to anchor element
  let left = rect.left + rect.width / 2 - popupWidth / 2;

  // Viewport boundary clamping horizontally
  if (left < padding) {
    left = padding;
  } else if (left + popupWidth > winWidth - padding) {
    left = Math.max(padding, winWidth - padding - popupWidth);
  }

  popupEl.style.position = 'fixed';
  popupEl.style.left = `${Math.round(left)}px`;
  popupEl.style.zIndex = zIndex;

  if (placement === 'below') {
    const top = rect.bottom + offsetY;
    popupEl.style.top = `${Math.round(top)}px`;
    popupEl.style.bottom = 'auto';
  } else {
    // Default 'above'
    const bottom = winHeight - rect.top + offsetY;
    popupEl.style.bottom = `${Math.round(bottom)}px`;
    popupEl.style.top = 'auto';
  }
}

/**
 * Attaches global dismissal listeners for popovers:
 * 1. Outside click: Triggers onDismiss if click target is outside popupEl and anchorEl.
 * 2. Escape key: Prevents default, closes popup, and returns focus to anchor.
 * 3. Window resize: Dynamically recalculates popover position.
 *
 * @returns PopoverBinding handle with `reposition()` and `destroy()` cleanup methods.
 */
export function attachPopoverDismissal(options: PopoverDismissalOptions): PopoverBinding {
  const { popupEl, anchorEl, onDismiss, onReposition, restoreFocus = true } = options;

  const onOutsideClick = (e: MouseEvent) => {
    const target = e.target as Node | null;
    if (target && !popupEl.contains(target) && !anchorEl.contains(target)) {
      onDismiss();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onDismiss();
      if (restoreFocus && typeof anchorEl.focus === 'function') {
        anchorEl.focus();
      }
    }
  };

  const onResize = () => {
    if (onReposition) {
      onReposition();
    }
  };

  document.addEventListener('click', onOutsideClick);
  document.addEventListener('keydown', onKeyDown);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
  }

  let isDestroyed = false;

  const destroy = () => {
    if (isDestroyed) return;
    isDestroyed = true;
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onKeyDown);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onResize);
    }
  };

  return {
    reposition: () => {
      if (!isDestroyed && onReposition) {
        onReposition();
      }
    },
    destroy,
  };
}

