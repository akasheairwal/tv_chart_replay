/**
 * Unified Authentication Modal (Sign In & Register).
 * Supports both Cloud (FastAPI) and Desktop (PySide6 QWebChannel) environments.
 */

import type { PythonBridge } from '../bridge/python-bridge';
import type { AuthStateManager, UserProfile } from '../auth/auth-state';
import { getIcon } from './icons';

export interface AuthModalOptions {
  initialTab?: 'login' | 'register';
  bannerMessage?: string;
  onSuccess?: (user: UserProfile) => void;
  onCancel?: () => void;
}

interface AuthResponse {
  ok: boolean;
  user?: UserProfile;
  token?: string;
  error?: string;
  message?: string;
}

export class AuthModal {
  private overlay: HTMLElement | null = null;
  private currentTab: 'login' | 'register' = 'login';
  private options: AuthModalOptions | null = null;
  private isSubmitting = false;

  constructor(
    private readonly parent: HTMLElement = document.body,
    private readonly authState: AuthStateManager,
    private readonly bridge: PythonBridge | null,
  ) {}

  show(options?: AuthModalOptions): void {
    this.options = options || {};
    this.currentTab = options?.initialTab || 'login';
    if (this.overlay) {
      this.close();
    }
    this.overlay = this.render();
    this.parent.appendChild(this.overlay);

    const firstInput = this.overlay.querySelector<HTMLInputElement>(
      this.currentTab === 'login' ? '#auth-login-username' : '#auth-reg-username',
    );
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 50);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', handleKeyDown);
        this.cancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
  }

  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private cancel(): void {
    const cb = this.options?.onCancel;
    this.close();
    if (cb) cb();
  }

  private setTab(tab: 'login' | 'register'): void {
    this.currentTab = tab;
    if (!this.overlay) return;

    this.clearError();
    const loginTabBtn = this.overlay.querySelector('#auth-tab-login');
    const regTabBtn = this.overlay.querySelector('#auth-tab-register');
    const loginForm = this.overlay.querySelector<HTMLElement>('#auth-login-form');
    const regForm = this.overlay.querySelector<HTMLElement>('#auth-reg-form');

    if (tab === 'login') {
      loginTabBtn?.classList.add('active');
      regTabBtn?.classList.remove('active');
      if (loginForm) loginForm.style.display = 'block';
      if (regForm) regForm.style.display = 'none';
      this.overlay.querySelector<HTMLInputElement>('#auth-login-username')?.focus();
    } else {
      regTabBtn?.classList.add('active');
      loginTabBtn?.classList.remove('active');
      if (loginForm) loginForm.style.display = 'none';
      if (regForm) regForm.style.display = 'block';
      this.overlay.querySelector<HTMLInputElement>('#auth-reg-username')?.focus();
    }
  }

  private showError(msg: string): void {
    const errBox = this.overlay?.querySelector<HTMLElement>('#auth-error-box');
    if (errBox) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
    }
  }

  private clearError(): void {
    const errBox = this.overlay?.querySelector<HTMLElement>('#auth-error-box');
    if (errBox) {
      errBox.textContent = '';
      errBox.style.display = 'none';
    }
  }

  private render(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay auth-modal-overlay';

    const bannerHtml = this.options?.bannerMessage
      ? `<div class="auth-banner-notice">${getIcon('history')} <span>${this.options.bannerMessage}</span></div>`
      : '';

    overlay.innerHTML = `
      <div class="modal-card auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div class="modal-header auth-modal-header">
          <div class="modal-title-wrap">
            <span class="auth-icon-badge">${getIcon('user')}</span>
            <div>
              <h2 id="auth-modal-title" class="modal-title">Paper Trading Account</h2>
              <p class="modal-subtitle">Save trade history, track win rates, and journal setups</p>
            </div>
          </div>
          <button type="button" class="modal-close-btn" id="auth-modal-close" title="Close">${getIcon('close')}</button>
        </div>

        ${bannerHtml}

        <div class="auth-tabs-nav">
          <button type="button" class="auth-tab-btn ${this.currentTab === 'login' ? 'active' : ''}" id="auth-tab-login">
            ${getIcon('log_in')}
            <span>Sign In</span>
          </button>
          <button type="button" class="auth-tab-btn ${this.currentTab === 'register' ? 'active' : ''}" id="auth-tab-register">
            ${getIcon('sparkles')}
            <span>Create Free Account</span>
          </button>
        </div>

        <div class="auth-error-alert" id="auth-error-box" style="display: none;"></div>

        <!-- 1. Sign In Form -->
        <form id="auth-login-form" class="auth-form" style="${this.currentTab === 'login' ? 'display: block;' : 'display: none;'}">
          <div class="auth-field-group">
            <label for="auth-login-username" class="auth-label">Username or Email</label>
            <div class="auth-input-wrap">
              <input type="text" id="auth-login-username" class="auth-input" placeholder="trader_pro" autocomplete="username" required />
            </div>
          </div>

          <div class="auth-field-group">
            <label for="auth-login-password" class="auth-label">Password</label>
            <div class="auth-input-wrap has-toggle">
              <input type="password" id="auth-login-password" class="auth-input" placeholder="••••••••" autocomplete="current-password" required />
              <button type="button" class="password-toggle-btn" data-target="auth-login-password" title="Toggle password visibility">
                ${getIcon('eye')}
              </button>
            </div>
          </div>

          <div class="auth-form-row">
            <label class="auth-checkbox-label">
              <input type="checkbox" id="auth-remember-me" checked />
              <span>Remember me</span>
            </label>
          </div>

          <button type="submit" class="auth-submit-btn btn-primary" id="auth-login-submit">
            <span>Sign In</span>
            ${getIcon('chevron_right')}
          </button>
        </form>

        <!-- 2. Create Account Form -->
        <form id="auth-reg-form" class="auth-form" style="${this.currentTab === 'register' ? 'display: block;' : 'display: none;'}">
          <div class="auth-field-group">
            <label for="auth-reg-username" class="auth-label">Username</label>
            <div class="auth-input-wrap">
              <input type="text" id="auth-reg-username" class="auth-input" placeholder="trader_pro" autocomplete="username" required minlength="3" />
            </div>
            <span class="auth-field-hint">Minimum 3 characters, letters, numbers, or underscores</span>
          </div>

          <div class="auth-field-group">
            <label for="auth-reg-email" class="auth-label">Email</label>
            <div class="auth-input-wrap">
              <input type="email" id="auth-reg-email" class="auth-input" placeholder="trader@example.com" autocomplete="email" required />
            </div>
          </div>

          <div class="auth-field-group">
            <label for="auth-reg-password" class="auth-label">Password</label>
            <div class="auth-input-wrap has-toggle">
              <input type="password" id="auth-reg-password" class="auth-input" placeholder="••••••••" autocomplete="new-password" required minlength="6" />
              <button type="button" class="password-toggle-btn" data-target="auth-reg-password" title="Toggle password visibility">
                ${getIcon('eye')}
              </button>
            </div>
            <span class="auth-field-hint">Minimum 6 characters</span>
          </div>

          <div class="auth-field-group">
            <label for="auth-reg-balance" class="auth-label">Initial Paper Balance ($ USD)</label>
            <div class="auth-input-wrap">
              <input type="number" id="auth-reg-balance" class="auth-input" value="10000" min="100" max="10000000" step="1000" required />
            </div>
            <span class="auth-field-hint">Default is $10,000. You can reset anytime.</span>
          </div>

          <button type="submit" class="auth-submit-btn btn-primary" id="auth-reg-submit">
            <span>Create Account & Start Saving Trades</span>
            ${getIcon('sparkles')}
          </button>
        </form>

        <div class="auth-modal-footer">
          <button type="button" class="auth-offline-btn" id="auth-offline-btn">
            ${getIcon('shield')}
            <span>Fast Offline Local Profile</span>
          </button>
        </div>
      </div>
    `;

    // Backdrop click dismisses
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.cancel();
      }
    });

    overlay.querySelector('#auth-modal-close')?.addEventListener('click', () => {
      this.cancel();
    });

    overlay.querySelector('#auth-tab-login')?.addEventListener('click', () => {
      this.setTab('login');
    });

    overlay.querySelector('#auth-tab-register')?.addEventListener('click', () => {
      this.setTab('register');
    });

    // Password visibility toggle
    overlay.querySelectorAll('.password-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = (btn as HTMLElement).dataset.target;
        if (!targetId) return;
        const input = overlay.querySelector<HTMLInputElement>(`#${targetId}`);
        if (!input) return;
        if (input.type === 'password') {
          input.type = 'text';
          btn.innerHTML = getIcon('eye_off');
        } else {
          input.type = 'password';
          btn.innerHTML = getIcon('eye');
        }
      });
    });

    // Handle Login Submit
    const loginForm = overlay.querySelector<HTMLFormElement>('#auth-login-form');
    loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLoginSubmit();
    });

    // Handle Register Submit
    const regForm = overlay.querySelector<HTMLFormElement>('#auth-reg-form');
    regForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleRegisterSubmit();
    });

    // Fast Offline Local Profile button
    overlay.querySelector('#auth-offline-btn')?.addEventListener('click', async () => {
      await this.handleQuickLocalUser();
    });

    return overlay;
  }

  private async handleLoginSubmit(): Promise<void> {
    if (this.isSubmitting || !this.overlay) return;
    const usernameInput = this.overlay.querySelector<HTMLInputElement>('#auth-login-username');
    const passwordInput = this.overlay.querySelector<HTMLInputElement>('#auth-login-password');
    const submitBtn = this.overlay.querySelector<HTMLButtonElement>('#auth-login-submit');

    const username = usernameInput?.value.trim() || '';
    const password = passwordInput?.value || '';

    if (!username || !password) {
      this.showError('Please enter both username and password.');
      return;
    }

    this.isSubmitting = true;
    this.clearError();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }

    try {
      let res: AuthResponse;
      if (this.bridge) {
        res = await this.bridge.callJson<AuthResponse>('authLogin', {
          username,
          password,
        });
      } else {
        // Direct cloud fetch fallback
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        res = await r.json();
      }

      if (res.ok && res.user && res.token) {
        this.authState.setAuthenticated(res.user, res.token);
        const cb = this.options?.onSuccess;
        this.close();
        if (cb) cb(res.user);
      } else {
        this.showError(res.message || res.error || 'Invalid username or password.');
      }
    } catch (err: any) {
      this.showError(`Login failed: ${err.message || 'Connection error'}`);
    } finally {
      this.isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
      }
    }
  }

  private async handleRegisterSubmit(): Promise<void> {
    if (this.isSubmitting || !this.overlay) return;
    const usernameInput = this.overlay.querySelector<HTMLInputElement>('#auth-reg-username');
    const emailInput = this.overlay.querySelector<HTMLInputElement>('#auth-reg-email');
    const passwordInput = this.overlay.querySelector<HTMLInputElement>('#auth-reg-password');
    const balanceInput = this.overlay.querySelector<HTMLInputElement>('#auth-reg-balance');
    const submitBtn = this.overlay.querySelector<HTMLButtonElement>('#auth-reg-submit');

    const username = usernameInput?.value.trim() || '';
    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';
    const initialBalance = parseFloat(balanceInput?.value || '10000') || 10000.0;

    if (!username || !email || !password) {
      this.showError('Please complete all required fields.');
      return;
    }

    if (username.length < 3) {
      this.showError('Username must be at least 3 characters.');
      return;
    }

    if (password.length < 6) {
      this.showError('Password must be at least 6 characters.');
      return;
    }

    this.isSubmitting = true;
    this.clearError();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }

    try {
      let res: AuthResponse;
      if (this.bridge) {
        res = await this.bridge.callJson<AuthResponse>('authRegister', {
          username,
          email,
          password,
          initial_balance: initialBalance,
        });
      } else {
        const r = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            email,
            password,
            initial_balance: initialBalance,
          }),
        });
        res = await r.json();
      }

      if (res.ok && res.user && res.token) {
        this.authState.setAuthenticated(res.user, res.token);
        const cb = this.options?.onSuccess;
        this.close();
        if (cb) cb(res.user);
      } else {
        this.showError(res.message || res.error || 'Registration failed.');
      }
    } catch (err: any) {
      this.showError(`Registration failed: ${err.message || 'Connection error'}`);
    } finally {
      this.isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
      }
    }
  }

  private async handleQuickLocalUser(): Promise<void> {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.clearError();

    try {
      if (this.bridge) {
        const res = await this.bridge.callJson<AuthResponse>(
          'authGetOrCreateLocalUser',
          { username: 'local_trader', initial_balance: 10000.0 },
        );
        if (res.ok && res.user && res.token) {
          this.authState.setAuthenticated(res.user, res.token);
          const cb = this.options?.onSuccess;
          this.close();
          if (cb) cb(res.user);
          return;
        }
      }

      // If browser mode or cloud
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: `trader_${Math.random().toString(36).substring(2, 7)}`,
          email: `trader_${Date.now()}@local.paper`,
          password: 'LocalPassword_123',
          initial_balance: 10000.0,
        }),
      });
      const data: AuthResponse = await res.json();
      if (data.ok && data.user && data.token) {
        this.authState.setAuthenticated(data.user, data.token);
        const cb = this.options?.onSuccess;
        this.close();
        if (cb) cb(data.user);
      } else {
        this.showError(data.message || 'Could not create quick local profile.');
      }
    } catch (err: any) {
      this.showError(`Error creating profile: ${err.message}`);
    } finally {
      this.isSubmitting = false;
    }
  }
}

