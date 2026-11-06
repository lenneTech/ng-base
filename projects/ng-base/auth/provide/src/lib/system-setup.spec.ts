import { PLATFORM_ID, TransferState, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  LT_FETCH,
  LT_RUNTIME_CONFIG,
  LT_RUNTIME_CONFIG_DEFAULTS,
  LT_SERVER_RUNTIME_CONFIG,
  LtErrorTranslationService,
  ltSha256,
  mergeLtRuntimeConfig,
  resetLtWarnOnceState,
  type LtRuntimeConfig,
} from '@lenne.tech/ng-base';

import { LT_SYSTEM_SETUP_STATE_KEY, LtSystemSetupService } from './system-setup';

const PARAMS = { email: 'admin@test.com', name: 'Admin', password: 'Secret123!' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });

let fetchMock: ReturnType<typeof vi.fn>;

function setup(options: { platform?: 'browser' | 'server'; providers?: Provider[]; runtime?: Partial<LtRuntimeConfig>; serverApiUrl?: string } = {}): LtSystemSetupService {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, ...options.runtime }) },
      { provide: LT_FETCH, useValue: fetchMock },
      ...(options.serverApiUrl ? [{ provide: LT_SERVER_RUNTIME_CONFIG, useValue: { public: {}, serverApiUrl: options.serverApiUrl } }] : []),
      ...(options.providers ?? []),
    ],
  });
  return TestBed.inject(LtSystemSetupService);
}

function respondWith(body: unknown): void {
  fetchMock.mockImplementation(async () => json(body));
}

const lastInit = () => fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
const lastHeaders = () => (lastInit().headers ?? {}) as Record<string, string>;

/** Answer `/system-setup/init` with a 403 carrying `message`, the status with `status`. */
function refuse(message: string, status: Record<string, unknown> | Error): void {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/system-setup/init')) {
      return json({ message, statusCode: 403 }, 403);
    }
    if (status instanceof Error) {
      throw status;
    }
    return json(status);
  });
}

beforeEach(() => {
  resetLtWarnOnceState();
  fetchMock = vi.fn(async () => json({}));
});

afterEach(() => vi.restoreAllMocks());

describe('LtSystemSetupService — status', () => {
  it('is undecided until checked', () => {
    const setupService = setup();
    expect(setupService.needsSetup()).toBeNull();
    expect(setupService.httpInitEnabled()).toBeNull();
    expect(setupService.httpInitTokenRequired()).toBeNull();
  });

  it('reports a blocked HTTP init, so the setup page shows a notice instead of the form', async () => {
    respondWith({ betterAuthEnabled: true, httpInitEnabled: false, httpInitTokenRequired: false, needsSetup: true });
    const setupService = setup({ runtime: { apiUrl: 'https://api.example.com' } });
    await expect(setupService.checkSetupStatus()).resolves.toEqual({ httpInitEnabled: false, httpInitTokenRequired: false, needsSetup: true });
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/system-setup/status', expect.anything());
    expect(setupService.needsSetup()).toBe(true);
    expect(setupService.httpInitEnabled()).toBe(false);
  });

  it('reports a released HTTP init that demands a token', async () => {
    respondWith({ httpInitEnabled: true, httpInitTokenRequired: true, needsSetup: true });
    const setupService = setup();
    await setupService.checkSetupStatus();
    expect(setupService.httpInitEnabled()).toBe(true);
    expect(setupService.httpInitTokenRequired()).toBe(true);
  });

  it('treats an API before 12.4.0 (no fields) and malformed values as released without a token', async () => {
    respondWith({ needsSetup: true });
    const setupService = setup();
    await setupService.checkSetupStatus();
    expect(setupService.httpInitEnabled()).toBe(true);
    expect(setupService.httpInitTokenRequired()).toBe(false);

    respondWith({ httpInitEnabled: 'false', httpInitTokenRequired: 'true', needsSetup: true });
    await setupService.checkSetupStatus();
    expect(setupService.httpInitEnabled()).toBe(true);
    expect(setupService.httpInitTokenRequired()).toBe(false);
  });

  it('falls back to "no setup flow" when the endpoint fails or is missing (404)', async () => {
    fetchMock.mockImplementation(async () => json({ message: 'Not Found' }, 404));
    const setupService = setup();
    await expect(setupService.checkSetupStatus()).resolves.toEqual({ needsSetup: false });
    expect(setupService.needsSetup()).toBe(false);

    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(setupService.checkSetupStatus()).resolves.toEqual({ needsSetup: false });
  });

  it('shares one request between parallel checks', async () => {
    respondWith({ needsSetup: true });
    const setupService = setup();
    await Promise.all([setupService.checkSetupStatus(), setupService.checkSetupStatus()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('LtSystemSetupService — SSR', () => {
  it('does not fetch a relative path on the server without an API URL and stays undecided', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const setupService = setup({ platform: 'server' });
    await expect(setupService.checkSetupStatus()).resolves.toEqual({ needsSetup: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setupService.needsSetup()).toBeNull();
  });

  it('fetches NG_API_URL on the server and transfers the status to the browser', async () => {
    respondWith({ httpInitEnabled: true, httpInitTokenRequired: false, needsSetup: true });
    const setupService = setup({ platform: 'server', runtime: { apiUrl: 'https://api.example.com' }, serverApiUrl: 'http://api.internal:3000' });
    await setupService.checkSetupStatus();
    expect(fetchMock).toHaveBeenCalledWith('http://api.internal:3000/system-setup/status', expect.anything());
    expect(TestBed.inject(TransferState).get(LT_SYSTEM_SETUP_STATE_KEY, null)).toEqual({ httpInitEnabled: true, httpInitTokenRequired: false, needsSetup: true });
  });

  it('starts from the transferred status in the browser without fetching', () => {
    const transferState = new TransferState();
    transferState.set(LT_SYSTEM_SETUP_STATE_KEY, { httpInitEnabled: false, httpInitTokenRequired: false, needsSetup: true });
    const setupService = setup({ providers: [{ provide: TransferState, useValue: transferState }] });
    expect(setupService.needsSetup()).toBe(true);
    expect(setupService.httpInitEnabled()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still fetches in the browser without an API URL (resolves against the app origin)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    respondWith({ needsSetup: true });
    await setup().checkSetupStatus();
    expect(fetchMock).toHaveBeenCalledWith('/system-setup/status', expect.anything());
  });
});

describe('LtSystemSetupService — initSetup', () => {
  it('hashes the password and sends no token header without a token', async () => {
    const setupService = setup({ runtime: { apiUrl: 'https://api.example.com' } });
    await setupService.initSetup(PARAMS);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/system-setup/init');
    expect(lastInit().method).toBe('POST');
    expect(JSON.parse(String(lastInit().body))).toEqual({ email: PARAMS.email, name: PARAMS.name, password: await ltSha256(PARAMS.password) });
    expect(lastHeaders()).not.toHaveProperty('X-System-Setup-Token');
  });

  it('sends the token trimmed and unhashed as X-System-Setup-Token, never in the body', async () => {
    const setupService = setup();
    const token = 'a-setup-token-of-32-characters!!';
    await setupService.initSetup({ ...PARAMS, token: `  ${token}\n` });
    expect(lastHeaders()['X-System-Setup-Token']).toBe(token);
    expect(String(lastInit().body)).not.toContain(token);

    await setupService.initSetup({ ...PARAMS, token: ' \n ' });
    expect(lastHeaders()).not.toHaveProperty('X-System-Setup-Token');
  });

  it('marks the setup as done after a successful init', async () => {
    respondWith({ needsSetup: true });
    const setupService = setup();
    await setupService.checkSetupStatus();
    respondWith({ success: true });
    await setupService.initSetup(PARAMS);
    expect(setupService.needsSetup()).toBe(false);
  });

  it('rethrows a refusal with its body, so the #LTNS_ code reaches the error translation, and re-reads the status', async () => {
    respondWith({ httpInitEnabled: true, httpInitTokenRequired: false, needsSetup: true });
    const setupService = setup();
    await setupService.checkSetupStatus();
    refuse('#LTNS_0054: Invalid system setup token', { httpInitEnabled: true, httpInitTokenRequired: true, needsSetup: true });

    const error = await setupService.initSetup({ ...PARAMS, token: 'wrong-token-but-16-chars' }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ data: { message: '#LTNS_0054: Invalid system setup token' }, status: 403, statusCode: 403 });
    expect(TestBed.inject(LtErrorTranslationService).parseError(error).code).toBe('LTNS_0054');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/system-setup/status');
    expect(setupService.httpInitTokenRequired()).toBe(true);
    expect(setupService.needsSetup()).toBe(true);
  });

  it('switches to the notice when the API closed the HTTP setup since the page loaded (LTNS_0053)', async () => {
    const setupService = setup();
    refuse('#LTNS_0053: System setup via HTTP is disabled', { httpInitEnabled: false, httpInitTokenRequired: false, needsSetup: true });
    await expect(setupService.initSetup(PARAMS)).rejects.toMatchObject({ status: 403 });
    expect(setupService.httpInitEnabled()).toBe(false);
  });

  it('does not re-read the status after an error that is not a refusal', async () => {
    const setupService = setup();
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(setupService.initSetup(PARAMS)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(async () => json({ message: 'boom' }, 500));
    await expect(setupService.initSetup(PARAMS)).rejects.toMatchObject({ message: 'boom', status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rethrows the refusal even when re-reading the status fails too', async () => {
    const setupService = setup();
    refuse('403 Forbidden', new TypeError('Failed to fetch'));
    await expect(setupService.initSetup(PARAMS)).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(setupService.needsSetup()).toBe(false);
  });
});
