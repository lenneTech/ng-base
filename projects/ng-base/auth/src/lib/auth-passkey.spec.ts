import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, LtI18nService, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { LtAuthService } from './auth-service';

const IAM = 'https://api.example.com/iam';
const buffer = (text: string) => new TextEncoder().encode(text).buffer;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });

let fetchMock: ReturnType<typeof vi.fn>;
let create: ReturnType<typeof vi.fn>;
let get: ReturnType<typeof vi.fn>;
let responses: Record<string, () => Response>;

const callsTo = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url) === `${IAM}${path}`).map(([, init]) => init as RequestInit);
const bodyOf = (path: string) => JSON.parse(String(callsTo(path)[0]?.body)) as Record<string, any>;

function setup(): { auth: LtAuthService; t: (key: string) => string } {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.example.com' }) },
    ],
  });
  const i18n = TestBed.inject(LtI18nService);
  return { auth: TestBed.inject(LtAuthService), t: (key) => i18n.t(key) };
}

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

const assertion = {
  getClientExtensionResults: () => ({}),
  id: 'cred-1',
  rawId: buffer('cred-1'),
  response: { authenticatorData: buffer('auth'), clientDataJSON: buffer('{}'), signature: buffer('sig'), userHandle: null },
  type: 'public-key',
};

const registerOptions = {
  attestation: 'none',
  challenge: 'Y2hhbGxlbmdl',
  challengeId: 'reg-ch-1',
  excludeCredentials: [{ id: 'Y3JlZC0x', transports: ['internal'], type: 'public-key' }],
  pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
  rp: { id: 'example.com', name: 'Example' },
  timeout: 60000,
  user: { displayName: 'someone@example.com', id: 'dXNlci0x', name: 'someone@example.com' },
};

beforeEach(() => {
  clearCookies();
  responses = {
    '/get-session': () => json(null),
    '/passkey/generate-authenticate-options': () =>
      json({
        allowCredentials: [{ id: 'Y3JlZC0x', type: 'public-key' }],
        challenge: 'AAAA',
        challengeId: 'ch-1',
        rpId: 'localhost',
        timeout: 60000,
        userVerification: 'preferred',
      }),
    '/passkey/generate-register-options': () => json(registerOptions),
    '/passkey/verify-authentication': () => json({ user: { email: 'a@example.com', id: 'u1' } }),
    '/passkey/verify-registration': () => json({ id: 'pk-2' }),
    '/token': () => json({ token: 'eyJ0.pre.jwt' }),
  };
  fetchMock = vi.fn(async (url: string) => (responses[String(url).slice(IAM.length)] ?? (() => json({})))());
  vi.stubGlobal('fetch', fetchMock);
  create = vi.fn();
  get = vi.fn(async () => assertion);
  Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create, get } });
});

afterEach(async () => {
  await settle();
  vi.unstubAllGlobals();
  clearCookies();
});

describe('authenticateWithPasskey', () => {
  it('signs in with the nest-server challengeId and stores the user', async () => {
    const { auth } = setup();
    const result = await auth.authenticateWithPasskey();
    expect(result).toMatchObject({ success: true, user: { id: 'u1' } });
    expect(auth.user()?.id).toBe('u1');
    expect(bodyOf('/passkey/verify-authentication')).toMatchObject({ challengeId: 'ch-1', response: { id: 'cred-1', type: 'public-key' } });
    // allowCredentials arrive as base64url and must reach WebAuthn as bytes
    const allow = get.mock.calls[0]![0].publicKey.allowCredentials;
    expect(new Uint8Array(allow[0].id)).toEqual(new TextEncoder().encode('cred-1'));
  });

  it('loads the user from the session when the answer carries only a session token, keeping nest-server-only fields', async () => {
    const { auth } = setup();
    auth.setUser({ email: 'old@example.com', id: 'u1', leadTableColumns: ['name'] });
    responses['/passkey/verify-authentication'] = () => json({ session: { token: 'tok-1' } });
    responses['/get-session'] = () => json({ user: { email: 'new@example.com', id: 'u1' } });
    const result = await auth.authenticateWithPasskey();
    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({ email: 'new@example.com', leadTableColumns: ['name'] });
    expect(auth.user()).toMatchObject({ email: 'new@example.com', leadTableColumns: ['name'] });
    expect(callsTo('/get-session')[0]?.credentials).toBe('include');
  });

  it('keeps the session token of a passkey answer out of the script-readable JWT cookie when the cookie session works', async () => {
    const { auth } = setup();
    responses['/passkey/verify-authentication'] = () => json({ session: { token: 'opaque-session-token' } });
    responses['/get-session'] = () => json({ user: { email: 'a@example.com', id: 'u1' } });
    await auth.authenticateWithPasskey();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(auth.authMode()).toBe('cookie');
    expect(document.cookie).not.toContain('opaque-session-token');
  });

  it('never takes the session token of a passkey answer as JWT, also without a cookie session (fails instead)', async () => {
    const { auth } = setup();
    responses['/passkey/verify-authentication'] = () => json({ session: { token: 'opaque-session-token' } });
    responses['/get-session'] = () => json(null);
    const result = await auth.authenticateWithPasskey();
    expect(result.success).toBe(false);
    expect(auth.authMode()).toBe('cookie');
    expect(document.cookie).not.toContain('opaque-session-token');
    expect(callsTo('/get-session').every((call) => !new Headers(call?.headers).get('Authorization'))).toBe(true);
  });

  it('reports a cancelled prompt, a failed options request and a missing WebAuthn', async () => {
    const { auth, t } = setup();
    get.mockRejectedValueOnce(new DOMException('cancelled', 'NotAllowedError'));
    expect(await auth.authenticateWithPasskey()).toEqual({ error: t('lt.auth.passkeyAborted'), success: false });

    responses['/passkey/generate-authenticate-options'] = () => json({ message: 'nope' }, 500);
    expect(await auth.authenticateWithPasskey()).toEqual({ error: t('lt.auth.passkeyError'), success: false });

    Object.defineProperty(navigator, 'credentials', { configurable: true, value: undefined });
    expect(await auth.authenticateWithPasskey()).toEqual({ error: t('lt.auth.passkeyUnsupported'), success: false });
    expect(auth.isLoading()).toBe(false);
  });

  it('passes the backend message of a failed verification through', async () => {
    const { auth } = setup();
    responses['/passkey/verify-authentication'] = () => json({ message: 'Passkey not found' }, 400);
    expect(await auth.authenticateWithPasskey()).toEqual({ error: 'Passkey not found', success: false });
    expect(auth.isAuthenticated()).toBe(false);
  });
});

describe('registerPasskey', () => {
  it('hands the account’s passkeys to the authenticator as excludeCredentials (bytes)', async () => {
    const { auth } = setup();
    create.mockRejectedValue(new DOMException('The authenticator was previously registered', 'InvalidStateError'));
    await auth.registerPasskey('MacBook');
    const options = create.mock.calls[0]![0].publicKey;
    expect(options.excludeCredentials).toHaveLength(1);
    expect(new Uint8Array(options.excludeCredentials[0].id)).toEqual(new TextEncoder().encode('cred-1'));
    expect(new Uint8Array(options.user.id)).toEqual(new TextEncoder().encode('user-1'));
  });

  it('says why when the authenticator already holds one, and stores nothing', async () => {
    const { auth, t } = setup();
    create.mockRejectedValue(new DOMException('The authenticator was previously registered', 'InvalidStateError'));
    const result = await auth.registerPasskey('MacBook');
    expect(result).toEqual({ error: t('lt.auth.passkeyAlreadyRegistered'), success: false });
    expect(callsTo('/passkey/verify-registration')).toHaveLength(0);
  });

  it('stores the passkey another authenticator creates, under the given name and challengeId', async () => {
    const { auth } = setup();
    create.mockResolvedValue({
      getClientExtensionResults: () => ({}),
      id: 'cred-2',
      rawId: buffer('cred-2'),
      response: { attestationObject: buffer('attestation'), clientDataJSON: buffer('{}'), getTransports: () => ['hybrid'] },
      type: 'public-key',
    });
    const result = await auth.registerPasskey('iPhone');
    expect(result).toEqual({ passkey: { id: 'pk-2' }, success: true });
    expect(bodyOf('/passkey/verify-registration')).toMatchObject({ challengeId: 'reg-ch-1', name: 'iPhone', response: { id: 'cred-2', response: { transports: ['hybrid'] } } });
  });

  it('reports a cancelled creation and a failed options request with the backend message', async () => {
    const { auth, t } = setup();
    create.mockRejectedValueOnce(new DOMException('cancelled', 'NotAllowedError'));
    expect(await auth.registerPasskey()).toEqual({ error: t('lt.auth.passkeyCreationAborted'), success: false });
    responses['/passkey/generate-register-options'] = () => json({ message: 'Not signed in' }, 401);
    expect(await auth.registerPasskey()).toEqual({ error: 'Not signed in', success: false });
  });
});
