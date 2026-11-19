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
async function wireClient(
  answer: { body: unknown; status?: number } = { body: { status: true } },
): Promise<{ client: LtAuthClient; fetch: ReturnType<typeof vi.fn>; lastBody: () => Record<string, unknown>; lastInit: () => RequestInit; lastUrl: () => string }> {
  const fetch = vi.fn(async () => new Response(JSON.stringify(answer.body), { headers: { 'content-type': 'application/json' }, status: answer.status ?? 200 }));
  const client = await createLtAuthClient({ basePath: '/iam', baseURL: 'https://api.example.com', fetch });
  const lastCall = () => fetch.mock.calls.at(-1) as unknown as [RequestInfo | URL, RequestInit];
  return {
    client,
    fetch,
    lastBody: () => JSON.parse(String(lastCall()[1].body)) as Record<string, unknown>,
    lastInit: () => lastCall()[1],
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

  it('applies the call options (headers, signal) to the request of every method that takes parameters', async () => {
    // Better Auth's proxy takes the fetch options as the second argument itself; `{ fetchOptions }` there is ignored.
    const { client, lastInit } = await wireClient();
    const signal = new AbortController().signal;
    const calls: ((options: { headers: Record<string, string>; signal: AbortSignal }) => Promise<unknown>)[] = [
      (o) => client.signIn.email({ email: 'a@test.com', password: PLAINTEXT }, o),
      (o) => client.signUp.email({ email: 'a@test.com', name: 'A', password: PLAINTEXT }, o),
      (o) => client.changePassword({ currentPassword: 'old-one', newPassword: PLAINTEXT }, o),
      (o) => client.requestPasswordReset({ email: 'a@test.com' }, o),
      (o) => client.resetPassword({ newPassword: PLAINTEXT, token: 't' }, o),
      (o) => client.sendVerificationEmail({ email: 'a@test.com' }, o),
      (o) => client.verifyEmail({ token: 'tok' }, o),
      (o) => client.twoFactor.verifyTotp({ code: '123456' }, o),
      (o) => client.twoFactor.enable({ password: PLAINTEXT }, o),
    ];
    for (const call of calls) {
      await call({ headers: { 'x-trace': 'abc' }, signal });
      expect(new Headers(lastInit().headers).get('x-trace')).toBe('abc');
      expect(lastInit().signal).toBe(signal);
    }
  });
});

describe('createLtAuthClient — the session token never reaches application code', () => {
  const SESSION_TOKEN = 'XqvQpZ8R2b1sD4fG6hJ7kL9mN0pQrStU';

  it('is dropped from the raw body too, when the caller asks Better Auth to answer it (throw: true)', async () => {
    const { client } = await wireClient({ body: { redirect: false, token: SESSION_TOKEN, user: { email: 'a@test.com', id: 'u1' } } });
    const answers = [
      await client.twoFactor.verifyTotp({ code: '123456' }, { throw: true }),
      await client.twoFactor.verifyBackupCode({ code: 'backup-1' }, { throw: true }),
      await client.signIn.social({ idToken: { token: 'provider-id-token' }, provider: 'microsoft' }, { throw: true }),
    ];
    for (const answer of answers) {
      expect(answer).toEqual({ redirect: false, user: { email: 'a@test.com', id: 'u1' } });
      expect(JSON.stringify(answer)).not.toContain(SESSION_TOKEN);
    }
  });
});

/**
 * Sign-in through a provider the API configured (`betterAuth.socialProviders` in nest-server), on
 * `POST /iam/sign-in/social` in two shapes: without `idToken` the answer is the provider's authorization URL (Better
 * Auth's client navigates there), with `idToken` it is `{ token, user }` at once, `token` being the opaque session
 * token. No credential travels, so nothing is hashed and the parameters go through as they are.
 */
describe('createLtAuthClient — signIn.social', () => {
  /** An opaque Better Auth session token, as `/sign-in/social` with `idToken` puts it into the body. */
  const SESSION_TOKEN = 'XqvQpZ8R2b1sD4fG6hJ7kL9mN0pQrStU';
  const JWT = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl';
  const USER = { email: 'a@test.com', id: 'u1' };

  it('sends POST /iam/sign-in/social with every field untouched and hashes nothing', async () => {
    const { client, lastBody, lastInit, lastUrl } = await wireClient();
    // `callbackURL` / `errorCallbackURL` are resolved by Better Auth like `redirectTo`, and `additionalParams` carries
    // `prompt: 'none'` for the silent attempt: a wrapper that rebuilt the payload would drop them.
    const params = {
      additionalParams: { prompt: 'none' },
      callbackURL: 'https://app.example.com/auth/callback?redirect=%2Fapp',
      errorCallbackURL: 'https://app.example.com/auth/login',
      loginHint: 'a@test.com',
      provider: 'microsoft',
    };
    await client.signIn.social(params);
    expect(lastUrl()).toBe('https://api.example.com/iam/sign-in/social');
    expect(lastInit().method).toBe('POST');
    expect(lastBody()).toEqual(params);
  });

  it('forwards the call options as fetch options', async () => {
    const { client, lastInit } = await wireClient();
    await client.signIn.social({ provider: 'microsoft' }, { headers: { 'x-tenant': 't1' } });
    expect(new Headers(lastInit().headers).get('x-tenant')).toBe('t1');
  });

  it('answers the authorization URL of the redirect shape unchanged', async () => {
    const { client } = await wireClient({ body: { redirect: false, url: 'https://login.example.com/authorize' } });
    const result = await client.signIn.social({ disableRedirect: true, provider: 'microsoft' });
    expect(result.data).toEqual({ redirect: false, url: 'https://login.example.com/authorize' });
  });

  it('removes the session token from an ID-token answer and keeps the user', async () => {
    const { client } = await wireClient({ body: { redirect: false, token: SESSION_TOKEN, user: USER } });
    const result = await client.signIn.social({ idToken: { token: 'provider-id-token' }, provider: 'microsoft' });
    expect(result.data).toEqual({ redirect: false, user: USER });
    expect(JSON.stringify(result)).not.toContain(SESSION_TOKEN);
  });

  it('keeps a JWT the server put into the answer on purpose', async () => {
    const { client } = await wireClient({ body: { redirect: false, token: JWT, user: USER } });
    const result = await client.signIn.social({ idToken: { token: 'provider-id-token' }, provider: 'microsoft' });
    expect(result.data?.token).toBe(JWT);
  });

  it('passes an error through', async () => {
    const { client } = await wireClient({ body: { code: 'SIGNUP_DISABLED', message: 'signup disabled' }, status: 401 });
    const result = await client.signIn.social({ idToken: { token: 'provider-id-token' }, provider: 'microsoft' });
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ message: 'signup disabled', status: 401 });
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
    expect(Object.keys(client.signIn).sort()).toEqual(['email', 'social']);
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
