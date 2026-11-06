import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';
import { firstValueFrom } from 'rxjs';

import { ltAuthInterceptor, LtUnauthorizedHandler } from './auth-interceptor';
import { LT_AUTH_INPUT_OPTIONS, type LtAuthOptions } from './auth-options';
import { LtAuthStore } from './auth-store';

const API = 'https://api.example.com';
const IAM = `${API}/iam`;
const USER = { email: 'a@example.com', id: 'u1' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
const flush = async () => {
  for (let index = 0; index < 5; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

let fetchMock: ReturnType<typeof vi.fn>;
let probe: () => Promise<Response> | Response;
let tokenAnswer: () => Response;

const fetchCalls = (url: string) => fetchMock.mock.calls.filter(([input]) => String(input) === url);

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

function signedIn(mode: 'cookie' | 'jwt' = 'cookie'): void {
  document.cookie = `lt-auth-state=${encodeURIComponent(JSON.stringify({ authMode: mode, user: USER }))}; path=/`;
  if (mode === 'jwt') {
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify('eyJ0.stale.jwt'))}; path=/`;
  }
}

async function setup(options: { auth?: LtAuthOptions; path?: string; platform?: 'browser' | 'server' } = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ children: [], path: '**' }]),
      provideHttpClient(withInterceptors([ltAuthInterceptor])),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: API }) },
      { provide: LT_AUTH_INPUT_OPTIONS, useValue: options.auth ?? {} },
    ],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(options.path ?? '/app/board');
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return {
    auth: TestBed.inject(LtAuthStore),
    handler: TestBed.inject(LtUnauthorizedHandler),
    http: TestBed.inject(HttpClient),
    httpTesting: TestBed.inject(HttpTestingController),
    navigate,
  };
}

const alive = () => json({ session: { id: 's1' }, user: USER });
const dead = () => json(null);

beforeEach(() => {
  clearCookies();
  probe = alive;
  tokenAnswer = () => json({ token: 'eyJ0.fresh.jwt' });
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `${IAM}/get-session`) {
      return probe();
    }
    if (url === `${IAM}/token`) {
      return tokenAnswer();
    }
    return json({});
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.useRealTimers();
  await settle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearCookies();
});

describe('LtUnauthorizedHandler — probes the session before logging out', () => {
  it('keeps the user signed in when the session is alive (mislabeled permission error)', async () => {
    signedIn();
    const { auth, handler } = await setup();
    await expect(handler.handle(`${API}/measures`)).resolves.toBe(false);
    expect(fetchCalls(`${IAM}/get-session`)).toHaveLength(1);
    expect((fetchCalls(`${IAM}/get-session`)[0]![1] as RequestInit).method).toBe('GET');
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('logs out and redirects to the login page with the current URL when the session is empty', async () => {
    signedIn();
    const { auth, handler, navigate } = await setup();
    probe = dead;
    await expect(handler.handle(`${API}/measures`)).resolves.toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/auth/login?redirect=%2Fapp%2Fboard');
  });

  it('logs out when the session endpoint itself rejects (401/403)', async () => {
    signedIn();
    const { auth, handler } = await setup();
    probe = () => json({}, 401);
    await handler.handle(`${API}/measures`);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it.each([
    ['network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['rate limit', () => json({}, 429)],
    ['bad gateway', () => json({}, 502)],
    ['service unavailable', () => json({}, 503)],
  ])('never logs out without a verdict (%s)', async (_label, answer) => {
    signedIn();
    const { auth, handler } = await setup();
    probe = answer as () => Promise<Response>;
    await expect(handler.handle(`${API}/measures`)).resolves.toBe(false);
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('ignores auth endpoints and configured public pages without probing', async () => {
    signedIn();
    const first = await setup();
    probe = dead;
    await first.handler.handle(`${IAM}/sign-in/email`);
    await first.handler.handle(`${IAM}/two-factor/verify-totp`);
    expect(fetchMock).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const second = await setup({ auth: { interceptor: { publicPaths: ['/public'] } }, path: '/public/page' });
    await second.handler.handle(`${API}/measures`);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(second.auth.isAuthenticated()).toBe(true);
  });

  it('ignores the built-in auth pages and a disabled interceptor', async () => {
    signedIn();
    const first = await setup({ path: '/auth/login' });
    await first.handler.handle(`${API}/measures`);
    expect(fetchMock).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const second = await setup({ auth: { interceptor: { enabled: false } } });
    probe = dead;
    await expect(second.handler.handle(`${API}/measures`)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing on the server', async () => {
    signedIn();
    const { handler } = await setup({ platform: 'server' });
    await expect(handler.handle(`${API}/measures`)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still evaluates a 401 that follows one arriving before the user was hydrated', async () => {
    const { auth, handler } = await setup();
    probe = dead;
    await handler.handle(`${API}/measures`);
    expect(fetchMock).not.toHaveBeenCalled();
    auth.setUser(USER);
    await expect(handler.handle(`${API}/measures`)).resolves.toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('re-probes the next 401 after a probe that gave no verdict', async () => {
    signedIn();
    const { auth, handler } = await setup();
    probe = () => Promise.reject(new TypeError('offline'));
    await handler.handle(`${API}/measures`);
    probe = dead;
    await handler.handle(`${API}/measures`);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('reuses a positive verdict for 1 s, then probes again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    signedIn();
    const { auth, handler } = await setup();
    for (const path of ['/measures', '/tasks', '/reports']) {
      await handler.handle(`${API}${path}`);
    }
    expect(fetchCalls(`${IAM}/get-session`)).toHaveLength(1);

    probe = dead;
    await handler.handle(`${API}/measures`);
    expect(auth.isAuthenticated()).toBe(true);

    vi.setSystemTime(Date.now() + 1001);
    await handler.handle(`${API}/measures`);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('collapses a burst of parallel 401s into a single logout', async () => {
    signedIn();
    const { handler, navigate } = await setup();
    probe = dead;
    const results = await Promise.all([handler.handle(`${API}/measures`), handler.handle(`${API}/tasks`), handler.handle(`${API}/reports`)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('re-mints the JWT when the cookie session is alive but the bearer got the 401; cookie mode leaves the JWT alone', async () => {
    signedIn('jwt');
    const jwt = await setup();
    await jwt.handler.handle(`${API}/measures`);
    expect(fetchCalls(`${IAM}/token`)).toHaveLength(1);
    expect(jwt.auth.jwtToken()).toBe('eyJ0.fresh.jwt');

    TestBed.resetTestingModule();
    clearCookies();
    fetchMock.mockClear();
    signedIn('cookie');
    const cookie = await setup();
    await cookie.handler.handle(`${API}/measures`);
    expect(fetchCalls(`${IAM}/token`)).toHaveLength(0);
  });
});

describe('ltAuthInterceptor', () => {
  it('sends credentials to the API, the bearer only in JWT mode', async () => {
    signedIn('jwt');
    const { http, httpTesting } = await setup();
    const pending = firstValueFrom(http.get(`${API}/measures`));
    const testRequest = httpTesting.expectOne(`${API}/measures`);
    expect(testRequest.request.withCredentials).toBe(true);
    expect(testRequest.request.headers.get('Authorization')).toBe('Bearer eyJ0.stale.jwt');
    testRequest.flush([]);
    await expect(pending).resolves.toEqual([]);
  });

  it('adds no bearer in cookie mode and leaves foreign URLs untouched', async () => {
    signedIn('cookie');
    const { http, httpTesting } = await setup();
    void firstValueFrom(http.get(`${API}/measures`)).catch(() => undefined);
    const api = httpTesting.expectOne(`${API}/measures`).request;
    expect(api.withCredentials).toBe(true);
    expect(api.headers.has('Authorization')).toBe(false);

    TestBed.resetTestingModule();
    clearCookies();
    signedIn('jwt');
    const second = await setup();
    void firstValueFrom(second.http.get('https://foreign.example.com/data')).catch(() => undefined);
    const foreign = second.httpTesting.expectOne('https://foreign.example.com/data').request;
    expect(foreign.withCredentials).toBe(false);
    expect(foreign.headers.has('Authorization')).toBe(false);
  });

  it('switches from cookie to JWT mode on a 401 and retries once with the bearer', async () => {
    signedIn('cookie');
    const { auth, http, httpTesting } = await setup();
    const pending = firstValueFrom(http.get<{ ok: boolean }>(`${API}/measures`));
    httpTesting.expectOne(`${API}/measures`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    const retry = httpTesting.expectOne(`${API}/measures`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer eyJ0.fresh.jwt');
    retry.flush({ ok: true });
    await expect(pending).resolves.toEqual({ ok: true });
    expect(auth.isJwtMode()).toBe(true);
  });

  it('refreshes a stale JWT on a 401 and retries with the fresh one', async () => {
    signedIn('jwt');
    const { http, httpTesting } = await setup();
    const pending = firstValueFrom(http.post(`${API}/measures`, { a: 1 }));
    httpTesting.expectOne(`${API}/measures`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    const retry = httpTesting.expectOne(`${API}/measures`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer eyJ0.fresh.jwt');
    expect(retry.request.body).toEqual({ a: 1 });
    retry.flush({});
    await expect(pending).resolves.toEqual({});
    expect(fetchCalls(`${IAM}/token`)).toHaveLength(1);
  });

  it('rethrows an unrecoverable 401 and hands it to the session-loss detection', async () => {
    signedIn('cookie');
    const { auth, http, httpTesting, navigate } = await setup();
    tokenAnswer = () => json({}, 401);
    probe = dead;
    const pending = firstValueFrom(http.get(`${API}/measures`));
    httpTesting.expectOne(`${API}/measures`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await expect(pending).rejects.toBeInstanceOf(HttpErrorResponse);
    await flush();
    httpTesting.expectNone(`${API}/measures`);
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/auth/login?redirect=%2Fapp%2Fboard');
  });

  it('hands a 401 that survives the retry to the handler (permission error: session alive, no logout)', async () => {
    signedIn('jwt');
    const { auth, handler, http, httpTesting } = await setup();
    const handle = vi.spyOn(handler, 'handle');
    const pending = firstValueFrom(http.get(`${API}/measures`));
    httpTesting.expectOne(`${API}/measures`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    httpTesting.expectOne(`${API}/measures`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await expect(pending).rejects.toMatchObject({ status: 401 });
    await flush();
    expect(handle).toHaveBeenCalledWith(`${API}/measures`);
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('keeps a caller-provided Authorization header and does not retry it; other errors pass through', async () => {
    signedIn('jwt');
    const { handler, http, httpTesting } = await setup();
    const handle = vi.spyOn(handler, 'handle');
    const own = firstValueFrom(http.get(`${API}/measures`, { headers: { Authorization: 'ApiKey 1' } }));
    const request = httpTesting.expectOne(`${API}/measures`);
    expect(request.request.headers.get('Authorization')).toBe('ApiKey 1');
    request.flush(null, { status: 401, statusText: 'Unauthorized' });
    await expect(own).rejects.toMatchObject({ status: 401 });
    await flush();
    httpTesting.expectNone(`${API}/measures`);
    expect(handle).toHaveBeenCalledWith(`${API}/measures`);

    handle.mockClear();
    const failing = firstValueFrom(http.get(`${API}/tasks`));
    httpTesting.expectOne(`${API}/tasks`).flush(null, { status: 500, statusText: 'Server Error' });
    await expect(failing).rejects.toMatchObject({ status: 500 });
    expect(handle).not.toHaveBeenCalled();
  });

  it('passes server-side requests through unchanged', async () => {
    signedIn('jwt');
    const { http, httpTesting } = await setup({ platform: 'server' });
    void firstValueFrom(http.get(`${API}/measures`)).catch(() => undefined);
    const request = httpTesting.expectOne(`${API}/measures`).request;
    expect(request.withCredentials).toBe(false);
    expect(request.headers.has('Authorization')).toBe(false);
  });
  it('refreshes a JWT close to its expiry before the request, with itself as bearer', async () => {
    const b64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const old = `${b64url({ alg: 'EdDSA' })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 30 })}.sig`;
    document.cookie = `lt-auth-state=${encodeURIComponent(JSON.stringify({ authMode: 'jwt', user: USER }))}; path=/`;
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify(old))}; path=/`;
    const { http, httpTesting } = await setup();
    const pending = firstValueFrom(http.get(`${API}/measures`));
    await flush();
    const tokenCall = fetchCalls(`${IAM}/token`)[0];
    expect(new Headers((tokenCall?.[1] as RequestInit | undefined)?.headers).get('Authorization')).toBe(`Bearer ${old}`);
    const request = httpTesting.expectOne(`${API}/measures`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer eyJ0.fresh.jwt');
    request.flush([]);
    await pending;
  });
});
