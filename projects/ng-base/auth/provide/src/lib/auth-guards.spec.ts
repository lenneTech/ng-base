import { PLATFORM_ID, REQUEST } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree, type ActivatedRouteSnapshot, type GuardResult, type MaybeAsync, type RouterStateSnapshot } from '@angular/router';
import { LT_FETCH, LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { ltAuthGuard, ltGuestGuard, ltRoleGuard, ltSystemSetupGuard } from './auth-guards';
import { LT_AUTH_INPUT_OPTIONS, type LtAuthOptions } from './auth-options';

const USER = { email: 'a@example.com', id: 'u1', roles: ['editor'] };
const stateCookie = (user: unknown) => `lt-auth-state=${encodeURIComponent(JSON.stringify({ authMode: 'cookie', user }))}`;

let fetchMock: ReturnType<typeof vi.fn>;

function clearCookies(): void {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; path=/; max-age=0`;
    }
  }
}

function setup(options: { auth?: LtAuthOptions; platform?: 'browser' | 'server'; requestCookie?: string; signedIn?: boolean } = {}): void {
  if (options.signedIn) {
    document.cookie = `${stateCookie(USER)}; path=/`;
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.example.com' }) },
      { provide: LT_AUTH_INPUT_OPTIONS, useValue: options.auth ?? {} },
      { provide: LT_FETCH, useValue: fetchMock },
      { provide: REQUEST, useValue: { headers: { get: (name: string) => (name === 'cookie' ? (options.requestCookie ?? '') : null) } } },
    ],
  });
}

/** Run a guard for `url` and serialise a redirect (`true` when it lets the navigation pass). */
async function run(guard: (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => MaybeAsync<GuardResult>, url: string): Promise<string | boolean> {
  const result = await TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
  return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : (result as boolean);
}

beforeEach(() => {
  clearCookies();
  fetchMock = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
});

afterEach(() => clearCookies());

describe('ltAuthGuard', () => {
  it('lets a signed-in user pass', async () => {
    setup({ signedIn: true });
    await expect(run(ltAuthGuard, '/app/board')).resolves.toBe(true);
  });

  it('sends a signed-out visitor to the login page with the target as redirect', async () => {
    setup();
    await expect(run(ltAuthGuard, '/app/board?tab=2')).resolves.toBe('/auth/login?redirect=%2Fapp%2Fboard%3Ftab%3D2');
  });

  it('honours a configured login path and decides on the server from the request cookie', async () => {
    setup({ auth: { loginPath: '/anmelden' } });
    await expect(run(ltAuthGuard, '/app')).resolves.toBe('/anmelden?redirect=%2Fapp');
    TestBed.resetTestingModule();
    setup({ platform: 'server', requestCookie: stateCookie(USER) });
    await expect(run(ltAuthGuard, '/app')).resolves.toBe(true);
  });
});

describe('ltGuestGuard', () => {
  it('lets signed-out visitors pass and redirects signed-in users', async () => {
    setup();
    await expect(run(ltGuestGuard(), '/auth/login')).resolves.toBe(true);
    TestBed.resetTestingModule();
    setup({ signedIn: true });
    await expect(run(ltGuestGuard(), '/auth/login')).resolves.toBe('/app');
    await expect(run(ltGuestGuard('/dashboard'), '/auth/login')).resolves.toBe('/dashboard');
  });
});

describe('ltRoleGuard', () => {
  it('needs a sign-in first, then one of the roles', async () => {
    setup();
    await expect(run(ltRoleGuard('editor'), '/admin')).resolves.toBe('/auth/login?redirect=%2Fadmin');
    TestBed.resetTestingModule();
    setup({ signedIn: true });
    await expect(run(ltRoleGuard('editor'), '/admin')).resolves.toBe(true);
    await expect(run(ltRoleGuard(['admin', 'editor']), '/admin')).resolves.toBe(true);
    await expect(run(ltRoleGuard('admin'), '/admin')).resolves.toBe('/');
    await expect(run(ltRoleGuard('admin', '/forbidden'), '/admin')).resolves.toBe('/forbidden');
  });
});

describe('ltSystemSetupGuard', () => {
  function status(body: Record<string, unknown>): void {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
  }

  it('does nothing unless enabled', async () => {
    setup();
    status({ needsSetup: true });
    await expect(run(ltSystemSetupGuard, '/')).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('HTTP init released', () => {
    beforeEach(() => status({ httpInitEnabled: true, httpInitTokenRequired: false, needsSetup: true }));

    it('redirects to the setup page while no admin exists, but stays on it', async () => {
      setup({ auth: { systemSetup: { enabled: true } } });
      await expect(run(ltSystemSetupGuard, '/')).resolves.toBe('/auth/setup');
      await expect(run(ltSystemSetupGuard, '/auth/setup?step=1')).resolves.toBe(true);
    });

    it('honours a configured setup path', async () => {
      setup({ auth: { systemSetup: { enabled: true, setupPath: '/einrichtung' } } });
      await expect(run(ltSystemSetupGuard, '/')).resolves.toBe('/einrichtung');
    });
  });

  it('never redirects while the HTTP init is not released, and reads the status once', async () => {
    status({ httpInitEnabled: false, httpInitTokenRequired: false, needsSetup: true });
    setup({ auth: { systemSetup: { enabled: true } } });
    for (const path of ['/', '/auth/login', '/auth/setup', '/', '/auth/setup']) {
      await expect(run(ltSystemSetupGuard, path)).resolves.toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('redirects against an API before 12.4.0, which reports no release', async () => {
    status({ betterAuthEnabled: true, needsSetup: true });
    setup({ auth: { systemSetup: { enabled: true } } });
    await expect(run(ltSystemSetupGuard, '/')).resolves.toBe('/auth/setup');
  });

  it('sends the setup page to the login once an admin exists, other pages pass', async () => {
    status({ httpInitEnabled: true, httpInitTokenRequired: false, needsSetup: false });
    setup({ auth: { loginPath: '/anmelden', systemSetup: { enabled: true } } });
    await expect(run(ltSystemSetupGuard, '/auth/setup')).resolves.toBe('/anmelden');
    await expect(run(ltSystemSetupGuard, '/')).resolves.toBe(true);
  });

  it('does not redirect when the status endpoint fails', async () => {
    fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }));
    setup({ auth: { systemSetup: { enabled: true } } });
    await expect(run(ltSystemSetupGuard, '/')).resolves.toBe(true);
  });
});
