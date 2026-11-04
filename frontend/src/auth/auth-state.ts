/**
 * Auth State Manager & Session Lifecycle Handler.
 * Tracks trading mode (guest, demo, authenticated), active user profile,
 * authentication tokens, and synchronizes with PythonBridge and Web Storage.
 */

import type { PythonBridge } from '../bridge/python-bridge';

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  balance: number;
  initial_balance?: number;
  created_at?: string;
}

export type TradingMode = 'guest' | 'demo' | 'authenticated';

export type AuthListener = (mode: TradingMode, user: UserProfile | null) => void;

export class AuthStateManager {
  private currentMode: TradingMode = 'guest';
  private currentUser: UserProfile | null = null;
  private token: string | null = null;
  private bridge: PythonBridge | null = null;
  private listeners: Set<AuthListener> = new Set();

  constructor(bridge?: PythonBridge | null) {
    if (bridge) {
      this.bridge = bridge;
    }
  }

  setBridge(bridge: PythonBridge | null): void {
    this.bridge = bridge;
    if (this.token && this.bridge) {
      this.bridge.setAuthToken(this.token);
    }
  }

  /**
   * Restores stored session or demo flag on startup.
   */
  async restoreSession(): Promise<void> {
    const savedToken = localStorage.getItem('auth_token');
    const savedMode = sessionStorage.getItem('trading_mode');

    if (savedToken) {
      this.token = savedToken;
      if (this.bridge) {
        this.bridge.setAuthToken(savedToken);
      }
      // Attempt validating token with backend
      try {
        if (this.bridge) {
          const res = await this.bridge.callJson<{ ok: boolean; data?: UserProfile }>(
            'authGetMe',
            { token: savedToken },
          );
          if (res.ok && res.data) {
            this.currentUser = res.data;
            this.currentMode = 'authenticated';
            this.notify();
            return;
          }
        }
      } catch {
        // Token invalid or expired
      }
      // If validation failed, clear stale token
      this.token = null;
      localStorage.removeItem('auth_token');
      if (this.bridge) {
        this.bridge.setAuthToken(null);
      }
    }

    if (savedMode === 'demo') {
      this.currentMode = 'demo';
    } else {
      this.currentMode = 'guest';
    }
    this.notify();
  }

  isGuest(): boolean {
    return this.currentMode === 'guest';
  }

  isDemo(): boolean {
    return this.currentMode === 'demo';
  }

  isAuthenticated(): boolean {
    return this.currentMode === 'authenticated' && this.currentUser !== null;
  }

  getMode(): TradingMode {
    return this.currentMode;
  }

  getUser(): UserProfile | null {
    return this.currentUser;
  }

  getToken(): string | null {
    return this.token;
  }

  setDemoMode(): void {
    this.currentMode = 'demo';
    this.currentUser = null;
    this.token = null;
    sessionStorage.setItem('trading_mode', 'demo');
    localStorage.removeItem('auth_token');
    if (this.bridge) {
      this.bridge.setAuthToken(null);
    }
    this.notify();
  }

  setAuthenticated(user: UserProfile, token: string): void {
    this.currentUser = user;
    this.token = token;
    this.currentMode = 'authenticated';
    localStorage.setItem('auth_token', token);
    sessionStorage.removeItem('trading_mode');
    if (this.bridge) {
      this.bridge.setAuthToken(token);
    }
    this.notify();
  }

  updateUser(updates: Partial<UserProfile>): void {
    if (this.currentUser) {
      this.currentUser = { ...this.currentUser, ...updates };
      this.notify();
    }
  }

  async signOut(): Promise<void> {
    if (this.token && this.bridge) {
      try {
        await this.bridge.callJson('authLogout', { token: this.token });
      } catch {
        /* ignore */
      }
    }
    this.currentUser = null;
    this.token = null;
    this.currentMode = 'guest';
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('trading_mode');
    if (this.bridge) {
      this.bridge.setAuthToken(null);
    }
    this.notify();
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    // Immediately invoke with current state
    listener(this.currentMode, this.currentUser);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentMode, this.currentUser);
      } catch (err) {
        console.error('Error in auth state listener:', err);
      }
    }
  }
}

