import { PLATFORM_ID, REQUEST } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, LtCookieService, mergeLtRuntimeConfig, type LtRuntimeConfig } from '@lenne.tech/ng-base';

import { LT_AUTH_INPUT_OPTIONS, LT_AUTH_OPTIONS, resolveLtAuthCookieNames, resolveLtCookiePrefix, type LtAuthOptions } from './auth-options';
import { LtAuthStateService, resolveLtAuthState } from './auth-state';

const encodeState = (state: unknown) => encodeURIComponent(JSON.stringify(state));

function clearCookies(): void {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; path=/; max-age=0`;
      document.cookie = `${name}=; path=/; domain=${location.hostname}; max-age=0`;
    }
  }
}

function cookieValue(name: string): string | undefined {
  return document.cookie
    .split(/;\s*/)
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function setup(options: { auth?: LtAuthOptions; cookie?: string; platform?: 'browser' | 'server'; runtime?: Partial<LtRuntimeConfig> } = {}): LtAuthStateService {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, options.runtime) },
      { provide: LT_AUTH_INPUT_OPTIONS, useValue: options.auth ?? {} },
      { provide: REQUEST, useValue: { headers: { get: (name: string) => (name === 'cookie' ? (options.cookie ?? '') : null) } } },
    ],
  });
  return TestBed.inject(LtAuthStateService);
}

beforeEach(() => clearCookies());
afterEach(() => clearCookies());

describe('auth cookie names', () => {
  it('uses the defaults without configuration', () => {
    expect(resolveLtAuthCookieNames(undefined)).toEqual({ state: 'lt-auth-state', token: 'lt-jwt-token' });
  });

  it('derives <prefix>-auth-state / -jwt-token from NG_PUBLIC_COOKIE_PREFIX, explicit names win', () => {
    expect(resolveLtAuthCookieNames(undefined, 'acme')).toEqual({ state: 'acme-auth-state', token: 'acme-jwt-token' });
    expect(resolveLtAuthCookieNames({ state: 'exact-state', token: 'exact-token' }, 'acme')).toEqual({ state: 'exact-state', token: 'exact-token' });
    expect(resolveLtAuthCookieNames({ state: 'only-state' })).toEqual({ state: 'only-state', token: 'lt-jwt-token' });
  });

  it('sanitises the prefix to cookie-name characters', () => {
    expect(resolveLtCookiePrefix('  acme  ')).toBe('acme');
    expect(resolveLtCookiePrefix('a;b=c d')).toBe('abcd');
    expect(resolveLtCookiePrefix('my.app_1-2')).toBe('my.app_1-2');
    expect(resolveLtCookiePrefix(123)).toBe('');
  });

  it('merges defaults ← provideLtAuth options ← runtime overrides into LT_AUTH_OPTIONS', () => {
    setup({ auth: { interceptor: { publicPaths: ['/public'] }, loginPath: '/login' }, runtime: { cookiePrefix: 'acme', lt: { auth: { loginPath: '/anmelden' } } } });
    const options = TestBed.inject(LT_AUTH_OPTIONS);
    expect(options.loginPath).toBe('/anmelden');
    expect(options.interceptor).toEqual({ enabled: true, publicPaths: ['/public'] });
    expect(options.cookieNames).toEqual({ state: 'acme-auth-state', token: 'acme-jwt-token' });
    expect(options.basePath).toBe('/iam');
  });
});

describe('resolveLtAuthState (duplicate-tolerant)', () => {
  it('returns null for empty or unrelated cookies', () => {
    expect(resolveLtAuthState('', 'lt-auth-state')).toBeNull();
    expect(resolveLtAuthState('other=1; foo=bar', 'lt-auth-state')).toBeNull();
  });

  it('prefers the user-bearing twin over a stale { user: null } twin, in any order', () => {
    const withUser = encodeState({ authMode: 'cookie', user: { id: '7' } });
    const empty = encodeState({ authMode: 'cookie', user: null });
    expect(resolveLtAuthState(`lt-auth-state=${empty}; lt-auth-state=${withUser}`, 'lt-auth-state')?.user).toEqual({ id: '7' });
    expect(resolveLtAuthState(`lt-auth-state=${withUser}; lt-auth-state=${empty}`, 'lt-auth-state')?.user).toEqual({ id: '7' });
    expect(resolveLtAuthState(`lt-auth-state=${empty}`, 'lt-auth-state')?.user).toBeNull();
  });

  it('skips malformed entries and honours the cookie name', () => {
    const withUser = encodeState({ authMode: 'cookie', user: { id: '9' } });
    expect(resolveLtAuthState(`lt-auth-state=%7Bnot-json; lt-auth-state=${withUser}`, 'lt-auth-state')?.user).toEqual({ id: '9' });
    expect(resolveLtAuthState(`acme-auth-state=${withUser}`, 'lt-auth-state')).toBeNull();
  });
});

describe('LtAuthStateService', () => {
  it('writes and reads the state and the JWT under the configured names', () => {
    const state = setup({ auth: { cookieNames: { state: 'app-state', token: 'app-jwt' } } });
    state.writeState({ authMode: 'jwt', user: { email: 'a@example.com', id: 'u1' } });
    state.setJwtToken('eyJ0.b.c');
    expect(cookieValue('app-state')).toBeTruthy();
    expect(cookieValue('lt-auth-state')).toBeUndefined();
    expect(state.readUser()).toEqual({ email: 'a@example.com', id: 'u1' });
    expect(state.getAuthMode()).toBe('jwt');
    expect(state.getJwtToken()).toBe('eyJ0.b.c');
  });

  it('hard-deletes the state and JWT cookies on clear', () => {
    const state = setup();
    state.writeState({ authMode: 'cookie', user: { email: 'a@example.com', id: 'u1' } });
    state.setJwtToken('eyJ0.b.c');
    state.clearAuthCookies();
    expect(cookieValue('lt-auth-state') ?? '').toBe('');
    expect(cookieValue('lt-jwt-token') ?? '').toBe('');
    expect(state.isAuthenticated()).toBe(false);
  });

  it('reads the request cookie on the server and never writes', () => {
    const state = setup({ cookie: `lt-auth-state=${encodeState({ authMode: 'cookie', user: { email: 'a@example.com', id: 'u1' } })}`, platform: 'server' });
    // Asserted on the cookie service, not on the shared happy-dom document: other spec files of the same worker
    // (Vitest runs with isolate: false) may still write document cookies asynchronously, which made this flaky.
    const cookies = TestBed.inject(LtCookieService);
    const set = vi.spyOn(cookies, 'set');
    const remove = vi.spyOn(cookies, 'delete');
    expect(state.readUser()?.id).toBe('u1');
    state.writeState({ authMode: 'cookie', user: null });
    state.setJwtToken('x');
    state.clearAuthCookies();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(state.getJwtToken()).toBeNull();
  });
});

describe('LtAuthStateService — JWT guard (only JWT-shaped values, never an opaque session token)', () => {
  it('refuses to store a value that is not JWT-shaped and clears the slot', () => {
    const state = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(state.setJwtToken('eyJ0.b.c')).toBe(true);
    expect(state.setJwtToken('opaque-session-token')).toBe(false);
    expect(cookieValue('lt-jwt-token') ?? '').toBe('');
    expect(state.getJwtToken()).toBeNull();
    expect(state.setJwtToken('eyJ.only-two')).toBe(false);
    warn.mockRestore();
  });

  it('stores the JWT raw, the form nest-server reads from the cookie (never JSON-quoted)', () => {
    const state = setup();
    expect(state.setJwtToken('eyJ0.payload.sig')).toBe(true);
    expect(cookieValue('lt-jwt-token')).toBe('eyJ0.payload.sig');
  });

  it('reads a JSON-quoted JWT of 22.0.0 and rewrites it raw', () => {
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify('eyJ0.legacy.sig'))}; path=/`;
    const state = setup();
    expect(cookieValue('lt-jwt-token')).toBe('%22eyJ0.legacy.sig%22');
    expect(state.getJwtToken()).toBe('eyJ0.legacy.sig');
    expect(cookieValue('lt-jwt-token')).toBe('eyJ0.legacy.sig');
  });

  it('never returns a stored non-JWT value and deletes it', () => {
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify('opaque-session-token'))}; path=/`;
    const state = setup();
    expect(state.getJwtToken()).toBeNull();
    expect(cookieValue('lt-jwt-token') ?? '').toBe('');
  });

  it('purges a stored non-JWT value at startup and falls back to cookie mode', () => {
    document.cookie = `lt-auth-state=${encodeState({ authMode: 'jwt', user: { email: 'a@example.com', id: 'u1' } })}; path=/`;
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify('opaque-session-token'))}; path=/`;
    const state = setup();
    expect(state.purgeInvalidJwt()).toBe(true);
    expect(cookieValue('lt-jwt-token') ?? '').toBe('');
    expect(state.getAuthMode()).toBe('cookie');
    expect(state.readUser()?.id).toBe('u1');
    expect(state.purgeInvalidJwt()).toBe(false);
  });
});
