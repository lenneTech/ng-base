import { PLATFORM_ID, REQUEST, TransferState, type Provider, type StateKey } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig, type LtRuntimeConfig } from '@lenne.tech/ng-base';

import { LT_AUTH_INPUT_OPTIONS, type LtAuthOptions } from './auth-options';
import { LT_AUTH_FEATURES_STATE_KEY, LT_AUTH_SIGN_OUT_HOOKS, LtAuthStore, readLtAuthAnswer } from './auth-store';

const API = 'https://api.example.com';
const IAM = `${API}/iam`;
const USER = { email: 'a@example.com', id: 'u1' };

type Route = (url: string, init: RequestInit) => Promise<Response> | Response;
let route: Route;
let fetchMock: ReturnType<typeof vi.fn>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
const flush = async () => {
  for (let index = 0; index < 5; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};
const encodeState = (state: unknown) => encodeURIComponent(JSON.stringify(state));

/** Let fire-and-forget work of the previous test (JWT prefetch, probes) finish: spec files share one document. */
const settle = async () => {
  for (let index = 0; index < 10; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

function clearCookies(): void {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; path=/; max-age=0`;
      document.cookie = `${name}=; path=/; domain=${location.hostname}; max-age=0`;
    }
  }
}

function cookieState(): { authMode?: string; user?: Record<string, unknown> | null } | null {
  const raw = document.cookie
    .split(/;\s*/)
    .find((entry) => entry.startsWith('lt-auth-state='))
    ?.slice('lt-auth-state='.length);
  return raw ? JSON.parse(decodeURIComponent(raw)) : null;
}

function cookieToken(): string | null {
  const raw = document.cookie
    .split(/;\s*/)
    .find((entry) => entry.startsWith('lt-jwt-token='))
    ?.slice('lt-jwt-token='.length);
  return raw ? (JSON.parse(decodeURIComponent(raw)) as string) : null;
}

/** Put a signed-in state into the browser cookies (before `setup()`, like a reload). */
function signedIn(mode: 'cookie' | 'jwt' = 'cookie', user: Record<string, unknown> = USER): void {
  document.cookie = `lt-auth-state=${encodeState({ authMode: mode, user })}; path=/`;
  if (mode === 'jwt') {
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify('eyJ0.stale.jwt'))}; path=/`;
  }
}

function setup(options: { auth?: LtAuthOptions; cookie?: string; platform?: 'browser' | 'server'; providers?: Provider[]; runtime?: Partial<LtRuntimeConfig> } = {}): LtAuthStore {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: API, ...options.runtime }) },
      { provide: LT_AUTH_INPUT_OPTIONS, useValue: options.auth ?? {} },
      { provide: REQUEST, useValue: { headers: { get: (name: string) => (name === 'cookie' ? (options.cookie ?? '') : null) } } },
      ...(options.providers ?? []),
    ],
  });
  return TestBed.inject(LtAuthStore);
}

function calls(url: string): RequestInit[] {
  return fetchMock.mock.calls.filter(([input]) => String(input instanceof Request ? input.url : input) === url).map(([, init]) => (init ?? {}) as RequestInit);
}

/** A TransferState as the browser sees it after an SSR response that carried `key`. */
function transferred<T>(key: StateKey<T>, value: T): TransferState {
  const state = new TransferState();
  state.set(key, value);
  return state;
}

const bearerOf = (init: RequestInit | undefined) => new Headers(init?.headers).get('Authorization');

beforeEach(() => {
  clearCookies();
  route = () => json({});
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => route(String(input instanceof Request ? input.url : input), init ?? {}));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.useRealTimers();
  await settle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearCookies();
});

describe('LtAuthStore — state from the auth-state cookie', () => {
  it('restores user and JWT mode from the browser cookie', () => {
    signedIn('jwt');
    const auth = setup();
    expect(auth.user()).toEqual(USER);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.isJwtMode()).toBe(true);
    expect(auth.jwtToken()).toBe('eyJ0.stale.jwt');
  });

  it('purges an opaque session token from the JWT cookie at startup and falls back to cookie mode', () => {
    document.cookie = `lt-auth-state=${encodeState({ authMode: 'jwt', user: USER })}; path=/`;
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify('opaque-session-token'))}; path=/`;
    const auth = setup();
    expect(auth.isJwtMode()).toBe(false);
    expect(auth.jwtToken()).toBeNull();
    expect(cookieToken()).toBeNull();
    expect(auth.user()).toEqual(USER);
  });

  it('renders the signed-in shell on the server from the request cookie, without any backend call', async () => {
    const auth = setup({ cookie: `lt-auth-state=${encodeState({ authMode: 'cookie', user: USER })}`, platform: 'server' });
    expect(auth.user()).toEqual(USER);
    await expect(auth.validateSession()).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers validateSession() with false on the server when the request carries no user', async () => {
    const auth = setup({ platform: 'server' });
    await expect(auth.validateSession()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('setUser normalises image: null and writes the cookie in the browser', () => {
    const auth = setup();
    auth.setUser({ ...USER, image: null, name: 'A' });
    expect(auth.user()?.image).toBeUndefined();
    expect(cookieState()).toEqual({ authMode: 'cookie', user: { ...USER, name: 'A' } });
  });

  it('setUser never writes a cookie on the server', () => {
    const auth = setup({ platform: 'server' });
    auth.setUser(USER);
    expect(auth.user()).toEqual(USER);
    expect(cookieState()).toBeNull();
  });

  it('clearUser resets the state to signed-out cookie mode and deletes the cookies', () => {
    signedIn('jwt');
    const auth = setup();
    auth.clearUser();
    expect(auth.user()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.authMode()).toBe('cookie');
    expect(cookieState()).toBeNull();
    expect(cookieToken()).toBeNull();
  });
});

describe('LtAuthStore — roles', () => {
  it('accepts both user shapes (role and roles)', () => {
    const auth = setup();
    auth.setUser({ ...USER, role: 'support', roles: ['user', 'editor'] });
    expect(auth.hasRole('editor')).toBe(true);
    expect(auth.hasRole('support')).toBe(true);
    expect(auth.hasRole('admin')).toBe(false);
    expect(auth.hasAnyRole('admin', 'editor')).toBe(true);
    expect(auth.hasAnyRole()).toBe(false);
  });

  it('never fails open on a malformed roles value and matches case-sensitively', () => {
    const auth = setup();
    auth.setUser({ ...USER, roles: 'superadmin' as unknown as string[] });
    expect(auth.hasRole('admin')).toBe(false);
    auth.setUser({ ...USER, roles: 42 as unknown as string[] });
    expect(() => auth.hasRole('admin')).not.toThrow();
    auth.setUser({ ...USER, roles: ['Editor'] });
    expect(auth.hasRole('editor')).toBe(false);
  });

  it('isAdmin and is2FAEnabled follow the user', () => {
    const auth = setup();
    expect(auth.isAdmin()).toBe(false);
    auth.setUser({ ...USER, roles: ['admin'], twoFactorEnabled: true });
    expect(auth.isAdmin()).toBe(true);
    expect(auth.is2FAEnabled()).toBe(true);
  });
});

describe('LtAuthStore — validateSession() in the browser', () => {
  function session(user: Record<string, unknown> | null): void {
    route = (url) => {
      if (url === `${IAM}/get-session`) {
        return json(user ? { session: { id: 's1' }, user } : null);
      }
      if (url === `${IAM}/token`) {
        return json({ token: 'eyJ0.fresh.jwt' });
      }
      return json({});
    };
  }

  it('keeps nest-server-only fields of the same user and takes the session values', async () => {
    signedIn('cookie', { ...USER, leadTableColumns: ['name'], name: 'Old' });
    const auth = setup();
    session({ ...USER, email: 'new@example.com', name: 'New' });
    await expect(auth.validateSession()).resolves.toBe(true);
    expect(auth.user()).toMatchObject({ email: 'new@example.com', leadTableColumns: ['name'], name: 'New' });
    expect(cookieState()?.user).toMatchObject({ leadTableColumns: ['name'] });
  });

  it('takes the session user verbatim for another identity, and for id-less users', async () => {
    signedIn('cookie', { ...USER, leadTableColumns: ['secret'] });
    const auth = setup();
    session({ email: 'b@example.com', id: 'u2' });
    await auth.validateSession();
    expect(auth.user()).toEqual({ email: 'b@example.com', id: 'u2', image: undefined });

    auth.setUser({ email: 'x@example.com', leadTableColumns: ['secret'] } as never);
    session({ email: 'y@example.com' });
    await auth.validateSession();
    expect(auth.user()?.['leadTableColumns']).toBeUndefined();
  });

  it('drops authorization keys the session omits (fail-closed) and lets the session downgrade them', async () => {
    signedIn('cookie', { ...USER, banned: false, role: 'admin', roles: ['admin'] });
    const auth = setup();
    session({ ...USER });
    await auth.validateSession();
    expect(auth.user()?.role).toBeUndefined();
    expect(auth.user()?.roles).toBeUndefined();
    expect(auth.user()?.banned).toBeUndefined();
    expect(auth.isAdmin()).toBe(false);

    auth.setUser({ ...USER, roles: ['admin'] });
    session({ ...USER, roles: [] });
    await auth.validateSession();
    expect(auth.user()?.roles).toEqual([]);

    auth.setUser({ ...USER, roles: ['admin'] });
    session({ ...USER, roles: ['admin'] });
    await auth.validateSession();
    expect(auth.isAdmin()).toBe(true);
  });

  it('trusts the cached user when the session carries none, else answers false', async () => {
    signedIn();
    const auth = setup();
    session(null);
    await expect(auth.validateSession()).resolves.toBe(true);
    expect(auth.user()).toEqual(USER);

    auth.clearUser();
    await expect(auth.validateSession()).resolves.toBe(false);
  });

  it('stops waiting after 10 s and falls back to the cached user', async () => {
    vi.useFakeTimers();
    signedIn();
    const auth = setup();
    route = (url) => (url === `${IAM}/get-session` ? new Promise<Response>(() => undefined) : json({}));
    const result = auth.validateSession();
    await vi.advanceTimersByTimeAsync(10_001);
    await expect(result).resolves.toBe(true);
    expect(calls(`${IAM}/get-session`)).toHaveLength(1);
  });

  it('prefetches a JWT as fallback but stays in cookie mode (cookie is primary)', async () => {
    signedIn();
    const auth = setup();
    session(USER);
    await auth.validateSession();
    await flush();
    expect(calls(`${IAM}/token`)[0]?.credentials).toBe('include');
    expect(cookieToken()).toBe('eyJ0.fresh.jwt');
    expect(auth.authMode()).toBe('cookie');
    expect(auth.jwtToken()).toBeNull();
  });
});

describe('LtAuthStore — fetchWithAuth()', () => {
  /** `/token` mints `eyJ0.fresh.jwt`; other API calls accept only that bearer. */
  function backendWithStaleBearer(token: { ok: boolean; token?: string }): void {
    route = (url, init) => {
      if (url === `${IAM}/token`) {
        return json({ token: token.token }, token.ok ? 200 : 401);
      }
      if (url === `${IAM}/get-session`) {
        return json({ session: { id: 's1' }, user: USER });
      }
      return bearerOf(init) === 'Bearer eyJ0.fresh.jwt' ? json({ ok: true }) : json({ message: 'Unauthorized' }, 401);
    };
  }

  it('in JWT mode sends the bearer and omits cookies, except for get-session, passkey and 2FA', async () => {
    signedIn('jwt');
    const auth = setup();
    await auth.fetchWithAuth(`${API}/measures`);
    expect(calls(`${API}/measures`)[0]?.credentials).toBe('omit');
    expect(bearerOf(calls(`${API}/measures`)[0])).toBe('Bearer eyJ0.stale.jwt');
    for (const path of ['/get-session', '/passkey/generate-authenticate-options', '/two-factor/verify-totp']) {
      await auth.fetchWithAuth(`${IAM}${path}`, { method: 'POST' });
      expect(calls(`${IAM}${path}`)[0]?.credentials).toBe('include');
    }
  });

  it('in cookie mode sends cookies and no bearer; an explicit credentials value wins', async () => {
    signedIn('cookie');
    const auth = setup();
    await auth.fetchWithAuth(`${API}/measures`);
    expect(calls(`${API}/measures`)[0]?.credentials).toBe('include');
    expect(bearerOf(calls(`${API}/measures`)[0])).toBeNull();
    await auth.fetchWithAuth(`${API}/other`, { credentials: 'same-origin' });
    expect(calls(`${API}/other`)[0]?.credentials).toBe('same-origin');
  });

  it('mints a fresh JWT on a stale bearer and retries once, body included', async () => {
    signedIn('jwt');
    const auth = setup();
    backendWithStaleBearer({ ok: true, token: 'eyJ0.fresh.jwt' });
    const response = await auth.fetchWithAuth(`${API}/measures`, { body: '{"a":1}', method: 'POST' });
    expect(response.status).toBe(200);
    expect(calls(`${IAM}/token`)).toHaveLength(1);
    expect(calls(`${IAM}/token`)[0]?.credentials).toBe('include');
    const attempts = calls(`${API}/measures`);
    expect(attempts).toHaveLength(2);
    expect(bearerOf(attempts[1])).toBe('Bearer eyJ0.fresh.jwt');
    expect(attempts[1]?.credentials).toBe('omit');
    expect(attempts[1]?.body).toBe('{"a":1}');
    expect(auth.jwtToken()).toBe('eyJ0.fresh.jwt');
  });

  it('returns the 401 without retry when no token can be minted', async () => {
    signedIn('jwt');
    const auth = setup();
    backendWithStaleBearer({ ok: false });
    const response = await auth.fetchWithAuth(`${API}/measures`);
    expect(response.status).toBe(401);
    expect(calls(`${API}/measures`)).toHaveLength(1);
  });

  it('retries only once: a 401 that survives a fresh token is a permission error', async () => {
    signedIn('jwt');
    const auth = setup();
    route = (url) => (url === `${IAM}/token` ? json({ token: 'eyJ0.fresh.jwt' }) : url === `${IAM}/get-session` ? json({ user: USER }) : json({}, 401));
    const response = await auth.fetchWithAuth(`${API}/measures`);
    expect(response.status).toBe(401);
    expect(calls(`${API}/measures`)).toHaveLength(2);
  });

  it('mints one token for a burst of parallel 401s', async () => {
    signedIn('jwt');
    const auth = setup();
    backendWithStaleBearer({ ok: true, token: 'eyJ0.fresh.jwt' });
    const responses = await Promise.all([auth.fetchWithAuth(`${API}/measures`), auth.fetchWithAuth(`${API}/measures`), auth.fetchWithAuth(`${API}/measures`)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(calls(`${IAM}/token`)).toHaveLength(1);
  });

  it('switches from cookie to JWT mode on a 401 while signed in and retries with the bearer', async () => {
    signedIn('cookie');
    const auth = setup();
    backendWithStaleBearer({ ok: true, token: 'eyJ0.fresh.jwt' });
    const response = await auth.fetchWithAuth(`${API}/measures`);
    expect(response.status).toBe(200);
    expect(auth.isJwtMode()).toBe(true);
    expect(cookieState()).toEqual({ authMode: 'jwt', user: USER });
    expect(bearerOf(calls(`${API}/measures`)[1])).toBe('Bearer eyJ0.fresh.jwt');
  });

  it('does not switch or retry when nobody is signed in', async () => {
    const auth = setup();
    backendWithStaleBearer({ ok: true, token: 'eyJ0.fresh.jwt' });
    const response = await auth.fetchWithAuth(`${API}/measures`);
    expect(response.status).toBe(401);
    expect(calls(`${IAM}/token`)).toHaveLength(0);
  });

  it('never retries an auth-flow endpoint (wrong password stays a verdict)', async () => {
    signedIn('cookie');
    const auth = setup();
    backendWithStaleBearer({ ok: true, token: 'eyJ0.fresh.jwt' });
    const response = await auth.fetchWithAuth(`${IAM}/sign-in/email`, { body: '{}', method: 'POST' });
    expect(response.status).toBe(401);
    expect(calls(`${IAM}/sign-in/email`)).toHaveLength(1);
    expect(calls(`${IAM}/token`)).toHaveLength(0);
  });

  it('keeps a caller-provided Authorization header and does not retry it', async () => {
    signedIn('jwt');
    const auth = setup();
    backendWithStaleBearer({ ok: true, token: 'eyJ0.fresh.jwt' });
    await auth.fetchWithAuth(`${API}/measures`, { headers: { Authorization: 'ApiKey 123' } });
    expect(bearerOf(calls(`${API}/measures`)[0])).toBe('ApiKey 123');
    expect(calls(`${API}/measures`)).toHaveLength(1);
  });

  it('never sends the token to a foreign host', async () => {
    signedIn('jwt');
    const auth = setup();
    route = () => json({}, 401);
    await auth.fetchWithAuth('https://foreign.example.com/data');
    expect(bearerOf(calls('https://foreign.example.com/data')[0])).toBeNull();
    expect(calls(`${IAM}/token`)).toHaveLength(0);
  });

  it('hands a 401 that survives to the session-loss detection (dead session → signed out, login redirect)', async () => {
    signedIn('cookie');
    const auth = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    route = (url) => (url === `${IAM}/get-session` ? json(null) : json({}, 401));
    await auth.fetchWithAuth(`${API}/measures`);
    await flush();
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/auth/login?redirect=%2F');
  });

  it('accepts Request and URL inputs', async () => {
    signedIn('jwt');
    const auth = setup();
    await auth.fetchWithAuth(new URL(`${API}/a`));
    await auth.fetchWithAuth(new Request(`${API}/b`, { headers: { 'x-test': '1' } }));
    expect(bearerOf(calls(`${API}/a`)[0])).toBe('Bearer eyJ0.stale.jwt');
    expect(new Headers(calls(`${API}/b`)[0]?.headers).get('x-test')).toBe('1');
    expect(bearerOf(calls(`${API}/b`)[0])).toBe('Bearer eyJ0.stale.jwt');
  });
});

describe('LtAuthStore — real JWT mode (nest-server `cookies: false`)', () => {
  const b64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  /** A JWT expiring `seconds` from now (signature irrelevant: the client reads `exp` for timing only). */
  const jwtExpiringIn = (seconds: number, id = 'a') => `${b64url({ alg: 'EdDSA' })}.${b64url({ exp: Math.floor(Date.now() / 1000) + seconds, sub: id })}.sig${id}`;
  const putJwt = (token: string) => {
    document.cookie = `lt-auth-state=${encodeState({ authMode: 'jwt', user: USER })}; path=/`;
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify(token))}; path=/`;
  };

  it('a session check keeps JWT mode: get-session proves the session, not the transport', async () => {
    const token = jwtExpiringIn(600);
    putJwt(token);
    const auth = setup();
    route = (url) => (url === `${IAM}/get-session` ? json({ session: { id: 's1' }, user: USER }) : json({}));
    expect(await auth.validateSession()).toBe(true);
    expect(await auth.loadSessionUser()).toMatchObject({ email: USER.email });
    await flush();
    expect(auth.authMode()).toBe('jwt');
    expect(cookieState()?.authMode).toBe('jwt');
    await auth.fetchWithAuth(`${API}/measures`);
    expect(bearerOf(calls(`${API}/measures`)[0])).toBe(`Bearer ${token}`);
    expect(calls(`${IAM}/token`)).toHaveLength(0);
  });

  it('adoptVerifiedSession takes a JWT of a 2FA/passkey answer into JWT mode, never an opaque session token', async () => {
    const token = jwtExpiringIn(900);
    const auth = setup();
    expect(await auth.adoptVerifiedSession({ token, user: USER })).toMatchObject({ email: USER.email });
    expect(auth.authMode()).toBe('jwt');
    expect(cookieToken()).toBe(token);
    expect(calls(`${IAM}/token`)).toHaveLength(0);

    auth.clearUser();
    route = (url) => (url === `${IAM}/token` ? json({ message: 'no session' }, 401) : json({}));
    await auth.adoptVerifiedSession({ data: { token: 'opaque-session-token', user: USER } });
    await flush();
    expect(auth.authMode()).toBe('cookie');
    expect(auth.user()).toMatchObject({ email: USER.email });
    expect(cookieToken()).toBeNull();
  });

  it('adoptVerifiedSession loads a missing user with the bearer, and stays signed out when that fails', async () => {
    const token = jwtExpiringIn(900);
    const auth = setup();
    route = (url, init) => (url === `${IAM}/get-session` && bearerOf(init) === `Bearer ${token}` ? json({ session: { id: 's1' }, user: USER }) : json(null));
    expect(await auth.adoptVerifiedSession({ session: { id: 's1' }, token })).toMatchObject({ email: USER.email });
    expect(auth.authMode()).toBe('jwt');

    auth.clearUser();
    route = () => json(null);
    expect(await auth.adoptVerifiedSession({ session: { id: 's1' }, token: jwtExpiringIn(900, 'b') })).toBeUndefined();
    expect(auth.user()).toBeNull();
    expect(auth.authMode()).toBe('cookie');
    expect(cookieToken()).toBeNull();
  });

  it('refreshes a JWT close to its expiry before sending, with itself as bearer', async () => {
    const old = jwtExpiringIn(30, 'old');
    const fresh = jwtExpiringIn(900, 'fresh');
    putJwt(old);
    const auth = setup();
    route = (url, init) => {
      if (url === `${IAM}/token`) {
        return bearerOf(init) === `Bearer ${old}` ? json({ token: fresh }) : json({}, 401);
      }
      return json({ ok: true });
    };
    await Promise.all([auth.fetchWithAuth(`${API}/a`), auth.fetchWithAuth(`${API}/b`)]);
    expect(calls(`${IAM}/token`)).toHaveLength(1);
    expect(bearerOf(calls(`${API}/a`)[0])).toBe(`Bearer ${fresh}`);
    expect(bearerOf(calls(`${API}/b`)[0])).toBe(`Bearer ${fresh}`);
    expect(cookieToken()).toBe(fresh);
  });

  it('keeps the old JWT when the refresh fails, and never sends an expired JWT to /token', async () => {
    const old = jwtExpiringIn(30, 'old');
    putJwt(old);
    const auth = setup();
    route = (url) => (url === `${IAM}/token` ? json({}, 401) : json({ ok: true }));
    await auth.fetchWithAuth(`${API}/a`);
    expect(bearerOf(calls(`${API}/a`)[0])).toBe(`Bearer ${old}`);

    clearCookies();
    putJwt(jwtExpiringIn(-10, 'expired'));
    TestBed.resetTestingModule();
    const later = setup();
    expect(await later.switchToJwtMode()).toBe(false);
    expect(bearerOf(calls(`${IAM}/token`).at(-1))).toBeNull();
  });
});

describe('LtAuthStore — sign-out (hooks, request, local state)', () => {
  it('signOut: beforeSignOut (flush) → POST /iam/sign-out → local state cleared → afterSignOut (wipe), in that order', async () => {
    const order: string[] = [];
    signedIn('jwt');
    let stateSeenByAfterHook: { authenticated: boolean; cookie: unknown } | null = null;
    const beforeSignOut = vi.fn(async (userId: string | null) => void order.push(`flush:${userId}`));
    const afterSignOut = vi.fn(async () => {
      order.push('wipe');
      stateSeenByAfterHook = { authenticated: auth.isAuthenticated(), cookie: cookieState() };
    });
    const auth = setup({ providers: [{ multi: true, provide: LT_AUTH_SIGN_OUT_HOOKS, useValue: { afterSignOut, beforeSignOut } }] });
    route = (url, init) => {
      if (url === `${IAM}/sign-out`) {
        order.push(`${init.method}:sign-out`);
      }
      return json({ success: true });
    };
    await auth.signOut();
    expect(order).toEqual(['flush:u1', 'POST:sign-out', 'wipe']);
    expect(beforeSignOut).toHaveBeenCalledWith('u1');
    expect(stateSeenByAfterHook).toEqual({ authenticated: false, cookie: null });
    expect(auth.isLoading()).toBe(false);
  });

  it('signOut logs a throwing before-/afterSignOut hook and still signs out (other hooks keep running)', async () => {
    signedIn();
    const failingBefore = vi.fn(() => {
      throw new Error('flush failed');
    });
    const failingAfter = vi.fn(async () => {
      throw new Error('wipe blocked');
    });
    const healthyAfter = vi.fn();
    const auth = setup({
      providers: [
        { multi: true, provide: LT_AUTH_SIGN_OUT_HOOKS, useValue: { afterSignOut: failingAfter, beforeSignOut: failingBefore } },
        { multi: true, provide: LT_AUTH_SIGN_OUT_HOOKS, useValue: { afterSignOut: healthyAfter } },
      ],
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(calls(`${IAM}/sign-out`)).toHaveLength(1);
    expect(auth.isAuthenticated()).toBe(false);
    expect(cookieState()).toBeNull();
    expect(healthyAfter).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('beforeSignOut'), expect.objectContaining({ message: 'flush failed' }));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('afterSignOut'), expect.objectContaining({ message: 'wipe blocked' }));
  });

  it('signOut clears the local session when the request fails (offline)', async () => {
    signedIn();
    const auth = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    route = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(auth.isAuthenticated()).toBe(false);
  });
});

describe('LtAuthStore — absolute app URLs', () => {
  it('absoluteAppUrl never derives the origin from the request on the server', () => {
    expect(() => setup({ platform: 'server' }).absoluteAppUrl('/auth/login')).toThrow(/NG_PUBLIC_SITE_URL/);
    TestBed.resetTestingModule();
    const auth = setup({ platform: 'server', runtime: { siteUrl: 'https://app.example.com' } });
    expect(auth.absoluteAppUrl('auth/login')).toBe('https://app.example.com/auth/login');
    expect(auth.absoluteAppUrl('https://other.example.com/x')).toBe('https://other.example.com/x');
  });
});

describe('LtAuthStore — feature flags', () => {
  it('fetches the flags once per burst and keeps them on errors', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/features` ? json({ emailVerification: true, passkey: true }) : json({}));
    await Promise.all([auth.fetchFeatures(), auth.ensureFeatures()]);
    expect(calls(`${IAM}/features`)).toHaveLength(1);
    expect(auth.features()).toEqual({ emailVerification: true, passkey: true });
    await auth.ensureFeatures();
    expect(calls(`${IAM}/features`)).toHaveLength(1);

    route = () => Promise.reject(new TypeError('offline'));
    await expect(auth.fetchFeatures()).resolves.toEqual({ emailVerification: true, passkey: true });
  });

  it('uses the flags transferred from SSR without fetching (no hydration mismatch)', async () => {
    const auth = setup({ providers: [{ provide: TransferState, useFactory: () => transferred(LT_AUTH_FEATURES_STATE_KEY, { passkey: true }) }] });
    expect(auth.features()).toEqual({ passkey: true });
    await auth.ensureFeatures();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('puts the flags into TransferState on the server, and skips the fetch without an API URL', async () => {
    const auth = setup({ platform: 'server' });
    route = (url) => (url === `${IAM}/features` ? json({ passkey: false }) : json({}));
    await auth.ensureFeatures();
    expect(TestBed.inject(TransferState).get(LT_AUTH_FEATURES_STATE_KEY, null)).toEqual({ passkey: false });

    TestBed.resetTestingModule();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockClear();
    await setup({ platform: 'server', runtime: { apiUrl: '' } }).fetchFeatures();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passkeySupported needs the backend feature, WebAuthn and enablePasskey', async () => {
    vi.stubGlobal('PublicKeyCredential', class {});
    route = (url) => (url === `${IAM}/features` ? json({ passkey: true }) : json({}));
    const auth = setup();
    expect(auth.passkeySupported()).toBe(false);
    await auth.fetchFeatures();
    expect(auth.passkeySupported()).toBe(true);

    TestBed.resetTestingModule();
    const disabled = setup({ auth: { enablePasskey: false } });
    await disabled.fetchFeatures();
    expect(disabled.passkeySupported()).toBe(false);
  });
});

describe('readLtAuthAnswer — nest-server and Better Auth answer shapes', () => {
  const user = { email: 'a@example.com', id: 'u1' };

  it('reads nest-server answers (raw body or Better Auth envelope)', () => {
    expect(readLtAuthAnswer({ data: { requiresTwoFactor: false, success: true, user }, error: null })).toEqual({
      emailVerificationRequired: false,
      jwt: null,
      session: true,
      twoFactor: false,
      user,
    });
    expect(readLtAuthAnswer({ requiresTwoFactor: true, success: false })).toMatchObject({ session: false, twoFactor: true, user: null });
    expect(readLtAuthAnswer({ data: { emailVerificationRequired: true, requiresTwoFactor: false, success: true, user } })).toMatchObject({ emailVerificationRequired: true });
  });

  it('counts only a JWT-shaped token as JWT; an opaque session token proves the session but is not a bearer', () => {
    expect(readLtAuthAnswer({ data: { token: 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1MSJ9.c2ln', user } }).jwt).toBe('eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1MSJ9.c2ln');
    expect(readLtAuthAnswer({ data: { redirect: false, token: 'opaque-session-token', user } })).toMatchObject({ jwt: null, session: true });
    expect(readLtAuthAnswer({ data: { twoFactorRedirect: true } }).twoFactor).toBe(true);
  });

  it('proves no session for a bare user, an error or success: false', () => {
    expect(readLtAuthAnswer({ data: { token: null, user } }).session).toBe(false);
    expect(readLtAuthAnswer({ data: null, error: { status: 401 } }).session).toBe(false);
    expect(readLtAuthAnswer({ success: false, user }).session).toBe(false);
  });
});
