import { PLATFORM_ID, REQUEST, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, ltSha256, mergeLtRuntimeConfig, type LtRuntimeConfig } from '@lenne.tech/ng-base';

import { LT_AUTH_INPUT_OPTIONS, LT_AUTH_SIGN_OUT_HOOKS, LtAuthStore, type LtAuthOptions } from '@lenne.tech/ng-base/auth/provide';

import { LtAuthService } from './auth-service';

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

/** The raw value of the JWT cookie: exactly the JWT (nest-server reads it as such), never JSON-quoted. */
function cookieToken(): string | null {
  const raw = document.cookie
    .split(/;\s*/)
    .find((entry) => entry.startsWith('lt-jwt-token='))
    ?.slice('lt-jwt-token='.length);
  return raw ? decodeURIComponent(raw) : null;
}

/** Put a signed-in state into the browser cookies (before `setup()`, like a reload). */
function signedIn(mode: 'cookie' | 'jwt' = 'cookie', user: Record<string, unknown> = USER): void {
  document.cookie = `lt-auth-state=${encodeState({ authMode: mode, user })}; path=/`;
  if (mode === 'jwt') {
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify('eyJ0.stale.jwt'))}; path=/`;
  }
}

function setup(
  options: { auth?: LtAuthOptions; cookie?: string; platform?: 'browser' | 'server'; providers?: Provider[]; runtime?: Partial<LtRuntimeConfig> } = {},
): LtAuthService {
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
  return TestBed.inject(LtAuthService);
}

function calls(url: string): RequestInit[] {
  return fetchMock.mock.calls.filter(([input]) => String(input instanceof Request ? input.url : input) === url).map(([, init]) => (init ?? {}) as RequestInit);
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

describe('LtAuthService — facade over LtAuthStore', () => {
  it('exposes the signals of the store and writes through to it', () => {
    signedIn('jwt');
    const auth = setup();
    const store = TestBed.inject(LtAuthStore);
    expect(auth.user).toBe(store.user);
    expect(auth.isAuthenticated).toBe(store.isAuthenticated);
    expect(auth.features).toBe(store.features);
    expect(auth.jwtToken()).toBe('eyJ0.stale.jwt');
    auth.setUser({ ...USER, roles: ['admin'] });
    expect(store.isAdmin()).toBe(true);
    expect(auth.hasAnyRole('admin')).toBe(true);
    store.clearUser();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('signs out through the store: hooks in order, POST /iam/sign-out, state cleared', async () => {
    const order: string[] = [];
    signedIn();
    const auth = setup({
      providers: [{ multi: true, provide: LT_AUTH_SIGN_OUT_HOOKS, useValue: { afterSignOut: () => void order.push('wipe'), beforeSignOut: () => void order.push('flush') } }],
    });
    route = (url, init) => {
      if (url === `${IAM}/sign-out`) {
        order.push(String(init.method));
      }
      return json({ success: true });
    };
    await auth.signOut();
    expect(order).toEqual(['flush', 'POST', 'wipe']);
    expect(auth.isAuthenticated()).toBe(false);
    expect(cookieState()).toBeNull();
  });
});

/** A JWT-shaped token as nest-server puts it into the body with `cookies: false` (three base64url segments). */
const BODY_JWT = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl';

describe('LtAuthService — sign-in, sign-up (real nest-server answers)', () => {
  function bodyOf(url: string): Record<string, unknown> {
    return JSON.parse(String(calls(url)[0]?.body)) as Record<string, unknown>;
  }

  it('signIn.email hashes the password, stores the user in cookie mode and prefetches a JWT', async () => {
    const auth = setup();
    // nest-server with cookies on: the token is removed from the body, the session is the httpOnly cookie
    route = (url) =>
      url === `${IAM}/sign-in/email`
        ? json({ requiresTwoFactor: false, success: true, user: { ...USER, image: null } })
        : url === `${IAM}/token`
          ? json({ token: 'eyJ0.pre.jwt' })
          : json({});
    const pending = auth.signIn.email({ email: USER.email, password: 'secret' });
    expect(auth.isLoading()).toBe(true);
    const result = await pending;
    await flush();
    expect(result.error).toBeNull();
    expect(auth.isLoading()).toBe(false);
    expect(bodyOf(`${IAM}/sign-in/email`)['password']).toBe(await ltSha256('secret'));
    expect(auth.user()).toEqual({ ...USER, image: undefined });
    expect(auth.authMode()).toBe('cookie');
    expect(cookieToken()).toBe('eyJ0.pre.jwt');
  });

  it('switches to JWT mode only for a JWT-shaped body token (nest-server cookies: false)', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/sign-in/email` ? json({ requiresTwoFactor: false, success: true, token: BODY_JWT, user: USER }) : json({}));
    await auth.signIn.email({ email: USER.email, password: 'secret' });
    expect(auth.isJwtMode()).toBe(true);
    expect(auth.jwtToken()).toBe(BODY_JWT);
    expect(cookieState()?.authMode).toBe('jwt');
  });

  it('never keeps the opaque session token of a native Better Auth answer as JWT', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/sign-in/email` ? json({ redirect: false, token: 'opaque-session-token', user: USER }) : json({}));
    await auth.signIn.email({ email: USER.email, password: 'secret' });
    await flush();
    expect(auth.user()?.id).toBe('u1');
    expect(auth.authMode()).toBe('cookie');
    expect(cookieToken()).toBeNull();
  });

  it('navigates to the 2FA page on nest-server’s { requiresTwoFactor: true, success: false } and sets no user', async () => {
    const auth = setup({ auth: { twoFactorRedirectPath: '/zwei-faktor' } });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    route = (url) => (url === `${IAM}/sign-in/email` ? json({ requiresTwoFactor: true, success: false }) : json({}));
    const result = await auth.signIn.email({ email: USER.email, password: 'secret' });
    expect(result.data?.requiresTwoFactor).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/zwei-faktor');
    expect(auth.isAuthenticated()).toBe(false);
    expect(cookieState()).toBeNull();
    expect(calls(`${IAM}/token`)).toHaveLength(0);
  });

  it('keeps the redirect query parameter of the login URL on the way to the 2FA page', async () => {
    const auth = setup({ auth: { twoFactorRedirectPath: '/zwei-faktor' } });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/auth/login?redirect=%2Fapp%2Fupload');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    route = (url) => (url === `${IAM}/sign-in/email` ? json({ requiresTwoFactor: true, success: false }) : json({}));
    await auth.signIn.email({ email: USER.email, password: 'secret' });
    expect(navigate).toHaveBeenCalledWith('/zwei-faktor?redirect=%2Fapp%2Fupload');
  });

  it('drops a redirect that is not app-relative', async () => {
    const auth = setup({ auth: { twoFactorRedirectPath: '/zwei-faktor' } });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/auth/login?redirect=%2F%2Fevil.example');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    route = (url) => (url === `${IAM}/sign-in/email` ? json({ requiresTwoFactor: true, success: false }) : json({}));
    await auth.signIn.email({ email: USER.email, password: 'secret' });
    expect(navigate).toHaveBeenCalledWith('/zwei-faktor');
  });

  it('navigates once on Better Auth’s native twoFactorRedirect too', async () => {
    const auth = setup({ auth: { twoFactorRedirectPath: '/zwei-faktor' } });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    route = (url) => (url === `${IAM}/sign-in/email` ? json({ twoFactorMethods: ['totp'], twoFactorRedirect: true }) : json({}));
    await auth.signIn.email({ email: USER.email, password: 'secret' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/zwei-faktor');
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('signUp.email hashes the password and keeps extra fields', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/sign-up/email` ? json({ requiresTwoFactor: false, success: true, user: USER }) : json({}));
    await auth.signUp.email({ email: USER.email, name: 'A', password: 'secret', termsAndPrivacyAccepted: true });
    expect(bodyOf(`${IAM}/sign-up/email`)).toEqual({ email: USER.email, name: 'A', password: await ltSha256('secret'), termsAndPrivacyAccepted: true });
    expect(auth.user()?.id).toBe('u1');
  });

  it('does not sign in after a sign-up that needs email verification (nest-server revoked the session)', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/sign-up/email` ? json({ emailVerificationRequired: true, requiresTwoFactor: false, success: true, user: USER }) : json({}));
    const result = await auth.signUp.email({ email: USER.email, name: 'A', password: 'secret' });
    await flush();
    expect(result.data?.emailVerificationRequired).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(cookieState()).toBeNull();
    expect(calls(`${IAM}/token`)).toHaveLength(0);
  });

  it('sets no user from an answer that proves no session ({ user } only, or success: false)', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/sign-up/email` ? json({ token: null, user: USER }) : json({}));
    await auth.signUp.email({ email: USER.email, name: 'A', password: 'secret' });
    expect(auth.isAuthenticated()).toBe(false);
    route = (url) => (url === `${IAM}/sign-in/email` ? json({ success: false, user: USER }) : json({}));
    await auth.signIn.email({ email: USER.email, password: 'secret' });
    expect(auth.isAuthenticated()).toBe(false);
  });
});

describe('LtAuthService — two-factor verification sets the user', () => {
  it('verifyTotp takes the user from the answer', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/two-factor/verify-totp` ? json({ token: null, user: USER }) : json({}));
    const result = await auth.twoFactor.verifyTotp({ code: '123456' });
    expect(result.error).toBeNull();
    expect(auth.user()?.id).toBe('u1');
  });

  it('never stores the session token of verify-totp / verify-backup-code as JWT and stays in cookie mode', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/two-factor/verify-totp` || url === `${IAM}/two-factor/verify-backup-code` ? json({ token: 'session-token', user: USER }) : json({}, 404));
    await auth.twoFactor.verifyTotp({ code: '123456' });
    await flush();
    expect(auth.user()?.id).toBe('u1');
    expect(auth.authMode()).toBe('cookie');
    expect(cookieState()?.authMode).toBe('cookie');
    expect(cookieToken()).toBeNull();

    auth.clearUser();
    await auth.twoFactor.verifyBackupCode({ code: 'backup-1' });
    await flush();
    expect(auth.authMode()).toBe('cookie');
    expect(cookieToken()).toBeNull();
  });

  it('prefetches the real JWT from /iam/token after 2FA, like after a password sign-in', async () => {
    const auth = setup();
    route = (url) =>
      url === `${IAM}/two-factor/verify-totp` ? json({ token: 'session-token', user: USER }) : url === `${IAM}/token` ? json({ token: 'eyJ0.real.jwt' }) : json({});
    await auth.twoFactor.verifyTotp({ code: '123456' });
    await flush();
    expect(calls(`${IAM}/token`)[0]?.credentials).toBe('include');
    expect(cookieToken()).toBe('eyJ0.real.jwt');
    expect(auth.authMode()).toBe('cookie');
  });

  it('drops the opaque session token from the verify answers it returns (service and raw client) and keeps a JWT', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/two-factor/verify-totp` || url === `${IAM}/two-factor/verify-backup-code` ? json({ token: 'session-token', user: USER }) : json({}, 404));
    const results = [await auth.twoFactor.verifyTotp({ code: '123456' }), await (await auth.getClient()).twoFactor.verifyBackupCode({ code: 'backup-1' })];
    for (const result of results) {
      expect(result.data).not.toHaveProperty('token');
      expect(result.data).toMatchObject({ user: { id: 'u1' } });
      expect(JSON.stringify(result)).not.toContain('session-token');
    }

    route = (url) => (url === `${IAM}/two-factor/verify-totp` ? json({ token: 'eyJ0.real.jwt', user: USER }) : json({}, 404));
    expect((await auth.twoFactor.verifyTotp({ code: '123456' })).data).toMatchObject({ token: 'eyJ0.real.jwt' });
  });

  it('in JWT mode takes the JWT of the rotated session from verify-totp and sends it from then on (nest-server 12.11.0+)', async () => {
    // The first verify-totp while enabling 2FA replaces the session, and since 12.11.0 a JWT is bound to its session:
    // the JWT the client had before is refused, the answer carries the JWT of the new session.
    signedIn('jwt');
    const auth = setup();
    route = (url, init) =>
      url === `${IAM}/two-factor/verify-totp`
        ? json({ token: BODY_JWT, user: USER })
        : bearerOf(init) === `Bearer ${BODY_JWT}`
          ? json({ ok: true })
          : json({ message: 'Unauthorized' }, 401);
    await auth.twoFactor.verifyTotp({ code: '123456' });
    expect(bearerOf(calls(`${IAM}/two-factor/verify-totp`)[0])).toBe('Bearer eyJ0.stale.jwt');
    expect(auth.jwtToken()).toBe(BODY_JWT);
    expect(cookieToken()).toBe(BODY_JWT);

    const response = await auth.fetchWithAuth(`${API}/measures`);
    expect(response.status).toBe(200);
    expect(calls(`${API}/measures`)).toHaveLength(1);
    expect(calls(`${IAM}/token`)).toHaveLength(0);
  });

  it('in JWT mode takes the JWT of the rotated session from twoFactor.disable / enable (nest-server 12.11.1+), mode and user unchanged', async () => {
    // Switching 2FA off (and on without verify-totp) replaces the session too; a JWT is bound to its session, and without
    // a session cookie the JWT in the answer is the only way to stay signed in.
    for (const method of ['disable', 'enable'] as const) {
      TestBed.resetTestingModule();
      fetchMock.mockClear();
      signedIn('jwt');
      const auth = setup();
      const answer = method === 'enable' ? { backupCodes: ['b1'], token: BODY_JWT, totpURI: 'otpauth://totp/x' } : { status: true, token: BODY_JWT };
      route = (url, init) =>
        url === `${IAM}/two-factor/${method}` ? json(answer) : bearerOf(init) === `Bearer ${BODY_JWT}` ? json({ ok: true }) : json({ message: 'Unauthorized' }, 401);
      const result = method === 'enable' ? await auth.twoFactor.enable({ password: 'secret' }) : await auth.twoFactor.disable({ password: 'secret' });
      expect(result.error ?? null).toBeNull();
      expect(auth.jwtToken()).toBe(BODY_JWT);
      expect(cookieToken()).toBe(BODY_JWT);
      expect(auth.authMode()).toBe('jwt');
      expect(auth.user()).toMatchObject({ id: 'u1' });
      expect((await auth.fetchWithAuth(`${API}/measures`)).status).toBe(200);
      expect(calls(`${IAM}/token`)).toHaveLength(0);
    }
  });

  it('leaves the JWT alone when twoFactor.disable / enable answer without a JWT (nest-server 12.11.0), and drops an opaque token', async () => {
    signedIn('jwt');
    const auth = setup();
    route = (url) =>
      url === `${IAM}/two-factor/disable`
        ? json({ status: true })
        : url === `${IAM}/two-factor/enable`
          ? json({ backupCodes: ['b1'], token: 'session-token', totpURI: 'otpauth://totp/x' })
          : json({});
    await auth.twoFactor.disable({ password: 'secret' });
    expect(auth.jwtToken()).toBe('eyJ0.stale.jwt');
    for (const result of [await auth.twoFactor.enable({ password: 'secret' }), await (await auth.getClient()).twoFactor.enable({ password: 'secret' })]) {
      expect(result.data).not.toHaveProperty('token');
      expect(result.data).toMatchObject({ totpURI: 'otpauth://totp/x' });
    }
    expect(auth.jwtToken()).toBe('eyJ0.stale.jwt');
    expect(cookieToken()).toBe('eyJ0.stale.jwt');
  });

  it('in cookie mode stays on the cookie session and keeps the JWT of a disable answer as fallback only', async () => {
    signedIn('cookie');
    const auth = setup();
    route = (url) => (url === `${IAM}/two-factor/disable` ? json({ status: true, token: BODY_JWT }) : json({}));
    await auth.twoFactor.disable({ password: 'secret' });
    expect(auth.authMode()).toBe('cookie');
    expect(auth.jwtToken()).toBeNull();
    expect(cookieToken()).toBe(BODY_JWT);
  });

  it('changePassword({ revokeOtherSessions: true }) takes the JWT of the new session and drops an opaque token, mode unchanged', async () => {
    signedIn('jwt');
    const auth = setup();
    route = (url) => (url === `${IAM}/change-password` ? json({ token: BODY_JWT, user: USER }) : json({}));
    const changed = await auth.changePassword({ currentPassword: 'old-secret', newPassword: 'new-secret', revokeOtherSessions: true });
    expect(changed.data).toMatchObject({ token: BODY_JWT });
    expect(auth.jwtToken()).toBe(BODY_JWT);
    expect(auth.authMode()).toBe('jwt');

    route = (url) => (url === `${IAM}/change-password` ? json({ token: 'session-token', user: USER }) : json({}));
    for (const result of [
      await auth.changePassword({ currentPassword: 'old-secret', newPassword: 'new-secret', revokeOtherSessions: true }),
      await (await auth.getClient()).changePassword({ currentPassword: 'old-secret', newPassword: 'new-secret', revokeOtherSessions: true }),
    ]) {
      expect(result.data).not.toHaveProperty('token');
      expect(JSON.stringify(result)).not.toContain('session-token');
    }
    expect(auth.jwtToken()).toBe(BODY_JWT);
  });

  it('setUser() without a mode keeps JWT mode when the signed-in user is updated (2FA switched on), another user starts on the cookie session', async () => {
    signedIn('jwt');
    const auth = setup();
    auth.setUser({ ...USER, twoFactorEnabled: true });
    expect(auth.authMode()).toBe('jwt');
    expect(auth.jwtToken()).toBe('eyJ0.stale.jwt');
    expect(auth.user()).toMatchObject({ twoFactorEnabled: true });

    auth.setUser({ email: 'b@example.com', id: 'u2' });
    expect(auth.authMode()).toBe('cookie');
    auth.setUser({ ...USER }, 'jwt');
    expect(auth.authMode()).toBe('jwt');
  });

  it('verifyBackupCode loads the user from the session when the answer has none', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/two-factor/verify-backup-code` ? json({ status: true }) : url === `${IAM}/get-session` ? json({ user: USER }) : json({}));
    await auth.twoFactor.verifyBackupCode({ code: 'backup-1' });
    expect(auth.user()?.id).toBe('u1');
    expect(calls(`${IAM}/get-session`)[0]?.credentials).toBe('include');
  });

  it('sets nothing when the code is wrong', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/two-factor/verify-totp` ? json({ code: 'INVALID_CODE', message: 'Invalid code' }, 401) : json({}));
    const result = await auth.twoFactor.verifyTotp({ code: '000000' });
    expect(result.error?.status).toBe(401);
    expect(auth.isAuthenticated()).toBe(false);
    expect(calls(`${IAM}/get-session`)).toHaveLength(0);
  });
});

/**
 * Every string written to `document.cookie` until `stop()`: proves a value never reached a cookie, not even for the
 * moment before a later write replaced it.
 */
function recordCookieWrites(): { stop: () => void; written: string[] } {
  const written: string[] = [];
  let owner: object | null = document;
  let native: PropertyDescriptor | undefined;
  while (owner && !native) {
    native = Object.getOwnPropertyDescriptor(owner, 'cookie');
    owner = Object.getPrototypeOf(owner) as object | null;
  }
  if (!native?.get || !native.set) {
    throw new Error('document.cookie has no accessor to wrap');
  }
  const { get, set } = native;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => get.call(document) as string,
    set: (value: string) => {
      written.push(value);
      set.call(document, value);
    },
  });
  return { stop: () => Reflect.deleteProperty(document, 'cookie'), written };
}

/**
 * `signIn.social` completes a sign-in the way the 2FA step does. The redirect shape (no `idToken`) answers
 * `{ url, redirect: true }` and leaves the page: nothing is stored, the user arrives through `validateSession()` on the
 * page the provider sends the browser back to. The ID-token shape (an app inside Microsoft Teams, where the host
 * already knows the user) answers `{ token, user }` at once: the user is stored, the JWT comes from `/iam/token`, and
 * the opaque session token of the answer never reaches a script-readable cookie.
 */
describe('LtAuthService — sign-in through a social provider', () => {
  /** An opaque Better Auth session token, as `/sign-in/social` with `idToken` puts it into the body. */
  const SESSION_TOKEN = 'XqvQpZ8R2b1sD4fG6hJ7kL9mN0pQrStU';
  const TOKEN_JWT = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1MSIsInR5cCI6InRva2VuIn0.c2lnbmF0dXJl';
  const ID_TOKEN = { idToken: { token: 'provider-id-token' }, provider: 'microsoft' };
  let cookieWrites: ReturnType<typeof recordCookieWrites>;

  beforeEach(() => {
    cookieWrites = recordCookieWrites();
  });

  afterEach(() => {
    cookieWrites.stop();
  });

  const bodyOf = (url: string) => JSON.parse(String(calls(url)[0]?.body)) as Record<string, unknown>;

  it('hands the parameters on, lets Better Auth leave the page and stores nothing on a redirect answer', async () => {
    signedIn();
    const auth = setup();
    const before = cookieState();
    const href = vi.spyOn(location, 'href', 'set').mockImplementation(() => undefined);
    route = (url) => (url === `${IAM}/sign-in/social` ? json({ redirect: true, url: 'https://login.example.com/authorize' }) : json({}));
    const params = {
      additionalParams: { prompt: 'none' },
      callbackURL: 'https://app.example.com/auth/callback',
      errorCallbackURL: 'https://app.example.com/auth/login',
      provider: 'microsoft',
    };
    const result = await auth.signIn.social(params);
    await flush();
    expect(bodyOf(`${IAM}/sign-in/social`)).toEqual(params);
    expect(result.data?.url).toBe('https://login.example.com/authorize');
    expect(href).toHaveBeenCalledWith('https://login.example.com/authorize');
    // A redirect answer carries no user: no session lookup, no JWT, the state stays as it was.
    expect(auth.user()).toEqual(USER);
    expect(cookieState()).toEqual(before);
    expect(calls(`${IAM}/get-session`)).toHaveLength(0);
    expect(calls(`${IAM}/token`)).toHaveLength(0);
  });

  it('signs the user in on an ID-token answer and fetches the JWT from /iam/token', async () => {
    const auth = setup();
    route = (url) =>
      url === `${IAM}/sign-in/social` ? json({ redirect: false, token: SESSION_TOKEN, user: USER }) : url === `${IAM}/token` ? json({ token: TOKEN_JWT }) : json({});
    const pending = auth.signIn.social(ID_TOKEN);
    expect(auth.isLoading()).toBe(true);
    const result = await pending;
    await flush();
    expect(auth.isLoading()).toBe(false);
    expect(auth.user()?.id).toBe('u1');
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.authMode()).toBe('cookie');
    expect(cookieState()).toEqual({ authMode: 'cookie', user: USER });
    expect(calls(`${IAM}/token`)).toHaveLength(1);
    expect(cookieToken()).toBe(TOKEN_JWT);
    // Neither the caller nor any cookie ever sees the session token.
    expect(result.data).toEqual({ redirect: false, user: USER });
    expect(cookieWrites.written.join('\n')).not.toContain(SESSION_TOKEN);
  });

  it.each([
    ['the session token', { token: SESSION_TOKEN }],
    ['an empty body', {}],
  ])('stays on the cookie session when /iam/token answers %s instead of a JWT, and writes no token cookie', async (_label, tokenAnswer) => {
    // No JWT arrives to overwrite a token cookie written before, so the recorded writes show what the sign-in stored.
    const auth = setup();
    route = (url) => (url === `${IAM}/sign-in/social` ? json({ redirect: false, token: SESSION_TOKEN, user: USER }) : url === `${IAM}/token` ? json(tokenAnswer) : json({}));
    await auth.signIn.social(ID_TOKEN);
    await flush();
    expect(auth.user()?.id).toBe('u1');
    expect(auth.authMode()).toBe('cookie');
    expect(cookieToken()).toBeNull();
    expect(calls(`${IAM}/token`)).toHaveLength(1);
    expect(cookieWrites.written.join('\n')).not.toContain(SESSION_TOKEN);
  });

  it('signs the user in from the body too when the caller passed throw: true, and returns it without the token', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/sign-in/social` ? json({ redirect: false, token: SESSION_TOKEN, user: USER }) : json({}));
    const result = await auth.signIn.social(ID_TOKEN, { throw: true });
    await flush();
    expect(result).toEqual({ redirect: false, user: USER });
    expect(auth.user()?.id).toBe('u1');
    expect(cookieWrites.written.join('\n')).not.toContain(SESSION_TOKEN);
  });

  it('takes a JWT the server put into the answer (nest-server cookies: false) and switches to JWT mode', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/sign-in/social` ? json({ redirect: false, token: BODY_JWT, user: USER }) : json({}));
    await auth.signIn.social(ID_TOKEN);
    await flush();
    expect(auth.user()?.id).toBe('u1');
    expect(auth.isJwtMode()).toBe(true);
    expect(auth.jwtToken()).toBe(BODY_JWT);
    expect(cookieState()?.authMode).toBe('jwt');
    expect(calls(`${IAM}/token`)).toHaveLength(0);
  });

  it('stores nothing after a refused sign-in and clears the loading flag', async () => {
    const auth = setup();
    route = (url) => (url === `${IAM}/sign-in/social` ? json({ code: 'SIGNUP_DISABLED', message: 'signup disabled' }, 401) : json({}));
    const result = await auth.signIn.social(ID_TOKEN);
    await flush();
    expect(result.error?.status).toBe(401);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.isLoading()).toBe(false);
    expect(cookieState()).toBeNull();
    expect(calls(`${IAM}/get-session`)).toHaveLength(0);
    expect(calls(`${IAM}/token`)).toHaveLength(0);
  });

  it('turns relative callback URLs into absolute app URLs (Better Auth would resolve them against the API)', async () => {
    const auth = setup({ runtime: { siteUrl: 'https://app.example.com/' } });
    route = () => json({ redirect: false, url: 'https://login.example.com/authorize' });
    await auth.signIn.social({
      callbackURL: '/auth/callback?redirect=%2Fapp',
      disableRedirect: true,
      errorCallbackURL: 'auth/login',
      newUserCallbackURL: 'https://other.example.com/welcome',
      provider: 'microsoft',
    });
    expect(bodyOf(`${IAM}/sign-in/social`)).toEqual({
      callbackURL: 'https://app.example.com/auth/callback?redirect=%2Fapp',
      disableRedirect: true,
      errorCallbackURL: 'https://app.example.com/auth/login',
      newUserCallbackURL: 'https://other.example.com/welcome',
      provider: 'microsoft',
    });
  });
});

describe('LtAuthService — password and email', () => {
  it('requestPasswordReset defaults redirectTo to the absolute site URL and keeps an explicit one', async () => {
    const auth = setup({ runtime: { siteUrl: 'https://app.example.com/' } });
    await auth.requestPasswordReset({ email: USER.email });
    expect(JSON.parse(String(calls(`${IAM}/request-password-reset`)[0]?.body))).toEqual({ email: USER.email, redirectTo: 'https://app.example.com/auth/reset-password' });
    await auth.requestPasswordReset({ email: USER.email, redirectTo: 'https://app.example.com/custom' });
    expect(JSON.parse(String(calls(`${IAM}/request-password-reset`)[1]?.body))['redirectTo']).toBe('https://app.example.com/custom');
  });

  it('sendVerificationEmail defaults callbackURL to the login page on the browser origin', async () => {
    const auth = setup();
    await auth.sendVerificationEmail({ email: USER.email });
    expect(JSON.parse(String(calls(`${IAM}/send-verification-email`)[0]?.body))).toEqual({ callbackURL: `${location.origin}/auth/login`, email: USER.email });
  });

  it('changePassword and resetPassword hash the credentials', async () => {
    const auth = setup();
    await auth.changePassword({ currentPassword: 'old', newPassword: 'new', revokeOtherSessions: true });
    await auth.resetPassword({ newPassword: 'new', token: 'tok' });
    expect(JSON.parse(String(calls(`${IAM}/change-password`)[0]?.body))).toEqual({
      currentPassword: await ltSha256('old'),
      newPassword: await ltSha256('new'),
      revokeOtherSessions: true,
    });
    expect(JSON.parse(String(calls(`${IAM}/reset-password`)[0]?.body))).toEqual({ newPassword: await ltSha256('new'), token: 'tok' });
  });
});

describe('LtAuthService — Better Auth client (lazy)', () => {
  it('is loaded once per app, shared by parallel callers, and goes through the auth-aware fetch', async () => {
    signedIn('jwt');
    const auth = setup();
    const [first, second] = await Promise.all([auth.getClient(), auth.getClient()]);
    expect(first).toBe(second);
    expect(await auth.getClient()).toBe(first);
    await first.getSession();
    const [init] = calls(`${IAM}/get-session`);
    expect(init?.credentials).toBe('include');
    expect(bearerOf(init)).toBe('Bearer eyJ0.stale.jwt');
  });

  it('targets /api/iam on the app origin behind the dev proxy', async () => {
    const auth = setup({ runtime: { apiProxy: true } });
    await (await auth.getClient()).getSession();
    expect(calls(`${location.origin}/api/iam/get-session`)).toHaveLength(1);
  });

  it('is not needed for state, validateSession, fetchWithAuth and the JWT switch', async () => {
    signedIn('cookie');
    const auth = setup();
    const getClient = vi.spyOn(auth, 'getClient');
    route = (url) => (url === `${IAM}/get-session` ? json({ user: USER }) : url === `${IAM}/token` ? json({ token: 'eyJ0.fresh.jwt' }) : json({}, 401));
    expect(auth.isAuthenticated()).toBe(true);
    await auth.validateSession();
    await auth.fetchWithAuth(`${API}/measures`);
    await auth.switchToJwtMode();
    auth.clearUser();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('passkey management calls the passkey routes', async () => {
    const auth = setup();
    route = () => json([{ id: 'pk-1' }]);
    await auth.passkey.list();
    await auth.passkey.delete('pk-1');
    expect(calls(`${IAM}/passkey/list-user-passkeys`)).toHaveLength(1);
    expect(JSON.parse(String(calls(`${IAM}/passkey/delete-passkey`)[0]?.body))).toEqual({ id: 'pk-1' });
  });
});
