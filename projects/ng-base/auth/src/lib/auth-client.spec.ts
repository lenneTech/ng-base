import { ltSha256 } from '@lenne.tech/ng-base';

import {
  clearLtAuthPluginRegistry,
  createLtAuthClient,
  getLtAuthPluginRegistry,
  registerLtAuthPlugins,
  resolveLtAuthClientBase,
  resolveLtAuthClientUrl,
  type LtAuthClient,
} from './auth-client';

const PLAINTEXT = 'correct horse battery staple';

/** The real Better Auth client over a recording fetch: asserts what reaches the wire. */
async function wireClient(): Promise<{ client: LtAuthClient; fetch: ReturnType<typeof vi.fn>; lastBody: () => Record<string, unknown>; lastUrl: () => string }> {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ status: true }), { headers: { 'content-type': 'application/json' }, status: 200 }));
  const client = await createLtAuthClient({ basePath: '/iam', baseURL: 'https://api.example.com', fetch });
  const lastCall = () => fetch.mock.calls.at(-1) as unknown as [RequestInfo | URL, RequestInit];
  return {
    client,
    fetch,
    lastBody: () => JSON.parse(String(lastCall()[1].body)) as Record<string, unknown>,
    lastUrl: () => String(lastCall()[0]),
  };
}

describe('createLtAuthClient — what reaches the wire', () => {
  const cases: { call: (client: LtAuthClient) => Promise<unknown>; field: string; name: string; path: string }[] = [
    { call: (c) => c.signIn.email({ email: 'a@test.com', password: PLAINTEXT }), field: 'password', name: 'signIn.email', path: '/iam/sign-in/email' },
    { call: (c) => c.signUp.email({ email: 'a@test.com', name: 'A', password: PLAINTEXT }), field: 'password', name: 'signUp.email', path: '/iam/sign-up/email' },
    { call: (c) => c.changePassword({ currentPassword: 'old-one', newPassword: PLAINTEXT }), field: 'newPassword', name: 'changePassword', path: '/iam/change-password' },
    { call: (c) => c.resetPassword({ newPassword: PLAINTEXT, token: 't' }), field: 'newPassword', name: 'resetPassword', path: '/iam/reset-password' },
    { call: (c) => c.twoFactor.disable({ password: PLAINTEXT }), field: 'password', name: 'twoFactor.disable', path: '/iam/two-factor/disable' },
    { call: (c) => c.twoFactor.enable({ password: PLAINTEXT }), field: 'password', name: 'twoFactor.enable', path: '/iam/two-factor/enable' },
    {
      call: (c) => c.twoFactor.generateBackupCodes({ password: PLAINTEXT }),
      field: 'password',
      name: 'twoFactor.generateBackupCodes',
      path: '/iam/two-factor/generate-backup-codes',
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.name} sends the hash, never the plaintext`, async () => {
      const { client, lastBody, lastUrl } = await wireClient();
      await testCase.call(client);
      expect(lastUrl()).toBe(`https://api.example.com${testCase.path}`);
      expect(lastBody()[testCase.field]).toBe(await ltSha256(PLAINTEXT));
      expect(JSON.stringify(lastBody())).not.toContain(PLAINTEXT);
    });
  }

  it('changePassword hashes both passwords and keeps revokeOtherSessions', async () => {
    const { client, lastBody } = await wireClient();
    await client.changePassword({ currentPassword: 'old-one', newPassword: PLAINTEXT, revokeOtherSessions: true });
    expect(lastBody()).toEqual({ currentPassword: await ltSha256('old-one'), newPassword: await ltSha256(PLAINTEXT), revokeOtherSessions: true });
  });

  it('twoFactor.enable keeps every other option (method, issuer)', async () => {
    const { client, lastBody } = await wireClient();
    await client.twoFactor.enable({ issuer: 'Acme', method: 'otp', password: PLAINTEXT });
    expect(lastBody()).toMatchObject({ issuer: 'Acme', method: 'otp' });
  });

  it('requestPasswordReset forwards redirectTo untouched and hashes nothing', async () => {
    const { client, lastBody } = await wireClient();
    await client.requestPasswordReset({ email: 'a@test.com', redirectTo: 'https://app.example.com/auth/reset-password' });
    expect(lastBody()).toEqual({ email: 'a@test.com', redirectTo: 'https://app.example.com/auth/reset-password' });
  });

  it('resetPassword forwards the token unchanged', async () => {
    const { client, lastBody } = await wireClient();
    await client.resetPassword({ newPassword: PLAINTEXT, token: 'tok-abc' });
    expect(lastBody()['token']).toBe('tok-abc');
  });

  it('refuses an empty password instead of sending something unhashed', async () => {
    const { client, fetch } = await wireClient();
    await expect(client.signIn.email({ email: 'a@test.com', password: '' })).rejects.toThrow(/"password" is required/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends cookies and calls the passkey routes without the passkey plugin', async () => {
    const { client, fetch, lastUrl } = await wireClient();
    await client.passkey.listUserPasskeys();
    expect(lastUrl()).toBe('https://api.example.com/iam/passkey/list-user-passkeys');
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].credentials).toBe('include');
  });

  it('verifyEmail sends the token as query, without a callbackURL', async () => {
    const { client, lastUrl } = await wireClient();
    await client.verifyEmail({ token: 'tok' });
    expect(lastUrl()).toBe('https://api.example.com/iam/verify-email?token=tok');
  });
});

describe('createLtAuthClient — the listed surface is the whole surface', () => {
  it('exposes exactly the listed members (Better Auth proxies have no own keys, nothing is spread)', async () => {
    const { client } = await wireClient();
    expect(Object.keys(client).sort()).toEqual(
      [
        'changePassword',
        'getSession',
        'passkey',
        'raw',
        'requestPasswordReset',
        'resetPassword',
        'sendVerificationEmail',
        'signIn',
        'signOut',
        'signUp',
        'twoFactor',
        'verifyEmail',
      ].sort(),
    );
    expect(Object.keys(client.signIn)).toEqual(['email']);
    expect(Object.keys(client.twoFactor).sort()).toEqual(['disable', 'enable', 'generateBackupCodes', 'verifyBackupCode', 'verifyTotp']);
    expect(Object.keys(client.passkey).sort()).toEqual(['deletePasskey', 'listUserPasskeys', 'updatePasskey']);
  });

  it('collects registered plugins and clears them', () => {
    clearLtAuthPluginRegistry();
    const plugin = { id: 'custom' };
    registerLtAuthPlugins([plugin]);
    expect(getLtAuthPluginRegistry()).toEqual([plugin]);
    clearLtAuthPluginRegistry();
    expect(getLtAuthPluginRegistry()).toEqual([]);
  });
});

describe('Better Auth base URL', () => {
  it('prefixes the base path with /api and uses the app origin behind the dev proxy', () => {
    expect(resolveLtAuthClientBase({ baseUrl: '/api', proxy: true }, '/iam')).toEqual({ basePath: '/api/iam', baseURL: '' });
    expect(resolveLtAuthClientBase({ baseUrl: '/api', proxy: true }, '/api/iam')).toEqual({ basePath: '/api/iam', baseURL: '' });
  });

  it('uses the API URL and the configured path otherwise', () => {
    expect(resolveLtAuthClientBase({ baseUrl: 'https://api.example.com', proxy: false }, 'auth/')).toEqual({ basePath: '/auth', baseURL: 'https://api.example.com' });
  });

  it('resolves an empty origin against the browser origin (Better Auth rejects relative URLs)', async () => {
    expect(resolveLtAuthClientUrl('', '/api/iam')).toBe(`${location.origin}/api/iam`);
    expect(resolveLtAuthClientUrl('https://api.example.com/', '/iam')).toBe('https://api.example.com/iam');
    await expect(createLtAuthClient({ basePath: '/api/iam', baseURL: '' })).resolves.toBeDefined();
  });
});
