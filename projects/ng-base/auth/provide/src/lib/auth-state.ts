import { DOCUMENT, isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { LtCookieService } from '@lenne.tech/ng-base';

import { LT_AUTH_OPTIONS } from './auth-options';
import type { LtAuthMode, LtAuthState, LtUser } from './auth-types';

/** Lifetime of the auth-state and JWT cookies (7 days). */
export const LT_AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/** Better Auth session cookies cleared best-effort on sign-out / session loss (the real ones are httpOnly). */
const BETTER_AUTH_COOKIES = ['better-auth.session_token', 'better-auth.session', '__Secure-better-auth.session_token', 'session_token', 'session'];
const BETTER_AUTH_COOKIE_PATHS = ['/', '/api', '/api/iam', '/iam'];

/**
 * Resolve the auth state from a raw cookie string, tolerating several cookies of the same name.
 *
 * A host-only cookie and a domain-scoped twin can coexist and disagree; the one carrying a `user` wins. Preferring the
 * user-less twin caused random logouts in the Nuxt stack. `lt-auth-state` is a UI cache, the session itself is the
 * httpOnly `iam.session_token`, so a forged cookie yields at most a UI that looks signed in while every API call 401s.
 */
export function resolveLtAuthState(cookieString: string, stateCookieName: string): LtAuthState | null {
  const prefix = `${stateCookieName}=`;
  let fallback: LtAuthState | null = null;
  for (const entry of (cookieString || '').split(/;\s*/)) {
    if (!entry.startsWith(prefix)) {
      continue;
    }
    try {
      const state = JSON.parse(decodeURIComponent(entry.slice(prefix.length))) as LtAuthState | null;
      if (state?.user) {
        return state;
      }
      if (state) {
        fallback = state;
      }
    } catch {
      // malformed entry
    }
  }
  return fallback;
}

/**
 * Read/write access to the auth cookies (`lt-auth-state`, `lt-jwt-token`) with the duplicate-tolerant read and the
 * SSR no-write rule. The server reads the request cookies and never writes.
 */
@Service()
export class LtAuthStateService {
  private readonly cookies = inject(LtCookieService);
  private readonly options = inject(LT_AUTH_OPTIONS);
  private readonly document = inject(DOCUMENT);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));

  /** Cookie names in use. */
  get cookieNames(): { state: string; token: string } {
    return this.options.cookieNames;
  }

  /** Current auth state from the cookies (`null` when none). */
  readState(): LtAuthState | null {
    return resolveLtAuthState(this.cookies.raw(), this.cookieNames.state);
  }

  /** Write the auth state (browser only; never writes a user-less state during SSR). */
  writeState(state: LtAuthState): void {
    if (this.isServer) {
      return;
    }
    const encoded = JSON.stringify(state);
    if (encodeURIComponent(encoded).length > 3500 && typeof ngDevMode !== 'undefined' && ngDevMode) {
      console.warn(`[@lenne.tech/ng-base] The auth-state cookie is ${encodeURIComponent(encoded).length} bytes; browsers drop cookies over 4 KB.`);
    }
    this.cookies.set(this.cookieNames.state, encoded, { maxAge: LT_AUTH_COOKIE_MAX_AGE });
  }

  /** Auth mode from the state cookie; `cookie` when unknown. */
  getAuthMode(): LtAuthMode {
    return this.readState()?.authMode === 'jwt' ? 'jwt' : 'cookie';
  }

  /** Merge `authMode` into the state cookie (keeps the user). */
  setAuthMode(mode: LtAuthMode): void {
    const current = this.readState();
    this.writeState({ authMode: mode, user: current?.user ?? null });
  }

  /**
   * First JWT of the token cookie(s), or `null`. Browser only. A value that is not JWT-shaped (e.g. an opaque Better Auth
   * session token an older version stored) is never returned and is deleted. A JSON-quoted JWT (`"eyJ…"`, written by
   * 22.0.0) is returned and rewritten raw, the form nest-server reads from the cookie.
   */
  getJwtToken(): string | null {
    if (this.isServer) {
      return null;
    }
    let invalid = false;
    for (const raw of this.cookies.getAll(this.cookieNames.token)) {
      const token = parseToken(raw);
      if (isLtJwtShaped(token)) {
        if (raw !== token) {
          this.deleteEverywhere(this.cookieNames.token);
          this.cookies.set(this.cookieNames.token, token, { maxAge: LT_AUTH_COOKIE_MAX_AGE });
        }
        return token;
      }
      invalid ||= !!token;
    }
    if (invalid) {
      this.deleteEverywhere(this.cookieNames.token);
    }
    return null;
  }

  /**
   * Store or clear the JWT (7 days). Browser only. Only JWT-shaped values are accepted: the token cookie is readable by
   * scripts, so an opaque session token (the body of `two-factor/*` or `passkey/*` answers) must never land there.
   * Returns whether the value was stored.
   */
  setJwtToken(token: string | null): boolean {
    if (this.isServer) {
      return false;
    }
    if (!token) {
      this.deleteEverywhere(this.cookieNames.token);
      return false;
    }
    if (!isLtJwtShaped(token)) {
      this.deleteEverywhere(this.cookieNames.token);
      console.warn('[@lenne.tech/ng-base] Refused to store a token that is not a JWT as JWT.');
      return false;
    }
    // Raw, not JSON-quoted: nest-server reads the cookie as the JWT itself (`lt-jwt-token`, JWT cookie strategy), as
    // nuxt-extensions writes it.
    this.cookies.set(this.cookieNames.token, token, { maxAge: LT_AUTH_COOKIE_MAX_AGE });
    return true;
  }

  /**
   * Delete a stored token that is not JWT-shaped and fall back to cookie mode (run at startup in the browser). Returns
   * whether something was purged.
   */
  purgeInvalidJwt(): boolean {
    if (this.isServer) {
      return false;
    }
    const stored = this.cookies.getAll(this.cookieNames.token).map(parseToken);
    if (!stored.some((token) => token && !isLtJwtShaped(token))) {
      return false;
    }
    this.deleteEverywhere(this.cookieNames.token);
    const state = this.readState();
    if (state?.authMode === 'jwt') {
      this.writeState({ authMode: 'cookie', user: state.user });
    }
    return true;
  }

  /** Whether any state cookie carries a user. */
  isAuthenticated(): boolean {
    return !!this.readState()?.user;
  }

  /** The user from the state cookie. */
  readUser(): LtUser | null {
    return this.readState()?.user ?? null;
  }

  /**
   * Delete the auth-state and JWT cookies on the host-only and the `domain=<host>` slot, and best-effort the Better Auth
   * cookies on the usual paths. Browser only.
   */
  clearAuthCookies(): void {
    if (this.isServer) {
      return;
    }
    this.deleteEverywhere(this.cookieNames.state);
    this.deleteEverywhere(this.cookieNames.token);
    for (const name of BETTER_AUTH_COOKIES) {
      for (const path of BETTER_AUTH_COOKIE_PATHS) {
        this.cookies.delete(name, { path });
      }
    }
  }

  private deleteEverywhere(name: string): void {
    const host = this.document.location?.hostname;
    this.cookies.delete(name, { path: '/' });
    if (host) {
      this.cookies.delete(name, { domain: host, path: '/' });
    }
  }
}

/** Whether `value` looks like a JWT (`eyJ…`, three segments), the same test nest-server applies (`isJwtShaped`). */
export function isLtJwtShaped(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('eyJ') && value.split('.').length === 3 && value.split('.').every((part) => part.length > 0);
}

/**
 * Whether the JWT expires within `marginMs` (by its `exp` claim, read without verification: only for timing the
 * refresh, never for trust). A token without a readable `exp` counts as not expiring; the server decides.
 */
export function ltJwtExpiresWithin(token: string, marginMs: number, now: number = Date.now()): boolean {
  const payload = token.split('.')[1];
  if (!payload) {
    return false;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))) as { exp?: unknown };
    return typeof claims.exp === 'number' && claims.exp * 1000 - now <= marginMs;
  } catch {
    return false;
  }
}

function parseToken(raw: string): string | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' && parsed ? parsed : null;
  } catch {
    return raw;
  }
}
