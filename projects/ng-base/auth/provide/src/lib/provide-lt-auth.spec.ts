import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, PLATFORM_ID, REQUEST, TransferState, type EnvironmentProviders, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { LT_FETCH, LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, LtErrorTranslationService, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';
import { firstValueFrom } from 'rxjs';

// Deliberately nothing from `@lenne.tech/ng-base/auth`: this entry must work without `LtAuthService` and Better Auth.
import { ltAuthGuard, ltRoleGuard } from './auth-guards';
import { ltAuthInterceptor } from './auth-interceptor';
import { LT_AUTH_OPTIONS } from './auth-options';
import { LT_AUTH_FEATURES_STATE_KEY, LtAuthStore } from './auth-store';
import { provideLtAuth } from './provide-lt-auth';

const API = 'https://api.example.com';
const IAM = `${API}/iam`;
const USER = { email: 'a@example.com', id: 'u1' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });

let fetchMock: ReturnType<typeof vi.fn>;
const calls = (url: string) => fetchMock.mock.calls.filter(([input]) => String(input) === url).map(([, init]) => (init ?? {}) as RequestInit);

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
    }
  }
}

async function bootstrap(platform: 'browser' | 'server', providers: (EnvironmentProviders | Provider)[] = []): Promise<void> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: platform },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: API }) },
      { provide: REQUEST, useValue: { headers: { get: () => '' } } },
      provideLtAuth({ loginPath: '/anmelden' }),
      ...providers,
    ],
  });
  await TestBed.inject(ApplicationInitStatus).donePromise;
}

beforeEach(() => {
  clearCookies();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `${IAM}/features`) {
      return json({ passkey: true });
    }
    if (url === `${IAM}/get-session`) {
      return json({ session: { id: 's1' }, user: USER });
    }
    if (url === `${IAM}/token`) {
      return json({ token: 'eyJ0.pre.jwt' });
    }
    return json({ errors: {} });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  await settle();
  vi.unstubAllGlobals();
  clearCookies();
});

describe('provideLtAuth', () => {
  it('provides the options and replaces LT_FETCH with the auth-aware fetch (error translation, AI, sync use it)', async () => {
    document.cookie = `lt-auth-state=${encodeURIComponent(JSON.stringify({ authMode: 'jwt', user: USER }))}; path=/`;
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify('eyJ0.b.c'))}; path=/`;
    await bootstrap('browser');
    expect(TestBed.inject(LT_AUTH_OPTIONS).loginPath).toBe('/anmelden');
    await TestBed.inject(LT_FETCH)(`${API}/measures`);
    expect(new Headers(calls(`${API}/measures`)[0]?.headers).get('Authorization')).toBe('Bearer eyJ0.b.c');
    await TestBed.inject(LtErrorTranslationService).loadTranslations('de');
    expect(new Headers(calls(`${API}/i18n/errors/de`)[0]?.headers).get('Authorization')).toBe('Bearer eyJ0.b.c');
  });

  it('browser start: fetches the features and validates the session in the background', async () => {
    await bootstrap('browser');
    const auth = TestBed.inject(LtAuthStore);
    await vi.waitFor(() => expect(auth.user()?.id).toBe('u1'));
    expect(auth.features()).toEqual({ passkey: true });
    expect(calls(`${IAM}/get-session`)).toHaveLength(1);
  });

  it('browser start: takes transferred features without fetching them again', async () => {
    const transferState = new TransferState();
    transferState.set(LT_AUTH_FEATURES_STATE_KEY, { passkey: false });
    await bootstrap('browser', [{ provide: TransferState, useValue: transferState }]);
    await vi.waitFor(() => expect(calls(`${IAM}/get-session`)).toHaveLength(1));
    expect(TestBed.inject(LtAuthStore).features()).toEqual({ passkey: false });
    expect(calls(`${IAM}/features`)).toHaveLength(0);
  });

  it('server start: waits for the features, transfers them and never asks for the session', async () => {
    await bootstrap('server');
    expect(TestBed.inject(TransferState).get(LT_AUTH_FEATURES_STATE_KEY, null)).toEqual({ passkey: true });
    expect(calls(`${IAM}/get-session`)).toHaveLength(0);
  });

  it('runs guards, interceptor, LT_FETCH and sign-out from this entry alone (no LtAuthService, no Better Auth)', async () => {
    document.cookie = `lt-auth-state=${encodeURIComponent(JSON.stringify({ authMode: 'jwt', user: { ...USER, roles: ['editor'] } }))}; path=/`;
    document.cookie = `lt-jwt-token=${encodeURIComponent(JSON.stringify('eyJ0.b.c'))}; path=/`;
    await bootstrap('browser', [provideHttpClient(withInterceptors([ltAuthInterceptor])), provideHttpClientTesting()]);
    const guard = (fn: typeof ltAuthGuard, url: string) => TestBed.runInInjectionContext(() => fn({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
    expect(guard(ltAuthGuard, '/app')).toBe(true);
    const roleRedirect = guard(ltRoleGuard('admin'), '/admin');
    expect(roleRedirect instanceof UrlTree ? TestBed.inject(Router).serializeUrl(roleRedirect) : roleRedirect).toBe('/');

    const pending = firstValueFrom(TestBed.inject(HttpClient).get(`${API}/measures`));
    const request = TestBed.inject(HttpTestingController).expectOne(`${API}/measures`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer eyJ0.b.c');
    request.flush([]);
    await pending;

    await TestBed.inject(LT_FETCH)(`${API}/tasks`);
    expect(new Headers(calls(`${API}/tasks`)[0]?.headers).get('Authorization')).toBe('Bearer eyJ0.b.c');

    await TestBed.inject(LtAuthStore).signOut();
    expect(calls(`${IAM}/sign-out`)[0]?.method).toBe('POST');
    expect(TestBed.inject(LtAuthStore).isAuthenticated()).toBe(false);
  });
});
