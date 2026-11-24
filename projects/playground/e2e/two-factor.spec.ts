import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { extractTOTPSecret, fillInput, generateTOTP, gotoAndWaitForHydration, waitForURLAndHydration } from '@lenne.tech/ng-base/testing';

import { createUser, expectVerifiedTransport, isApiPost, JWT_SHAPE, LOGIN_FIELDS, login, readAuthState, readJwtCookie, readSessionCookies, SHA256_HEX } from './support/auth';
import { BROWSER_API_URL } from './support/env';

/** 2FA: set-up on /app (TOTP + backup codes), then the sign-in detour over /auth/2fa with a TOTP and a backup code. */
test.describe.configure({ mode: 'serial' });

let user: { email: string; password: string };
let secret: string;
let backupCodes: string[];

/**
 * Sign in with the password on the login page and land on /auth/2fa; returns the sign-in answer. A `redirect` of the
 * login page survives the detour (`/auth/2fa?redirect=…`); without one the 2FA page falls back to /app.
 */
async function signInExpectingSecondFactor(page: Page, redirect?: string): Promise<Record<string, unknown>> {
  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
  await gotoAndWaitForHydration(page, `/auth/login${query}`);
  await fillInput(page, LOGIN_FIELDS.email, user.email);
  await fillInput(page, LOGIN_FIELDS.password, user.password);
  const answer = page.waitForResponse((response) => isApiPost(response.request(), '/iam/sign-in/email'));
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  const body = (await (await answer).json()) as Record<string, unknown>;
  await waitForURLAndHydration(page, new RegExp(`/auth/2fa${query.replace(/[?.*+^$()|[\]\\]/g, '\\$&')}$`));
  // Marker that only survives client-side navigation: the second factor must sign in without a page load.
  await page.evaluate(() => ((window as unknown as Record<string, unknown>)['__noReload'] = true));
  return body;
}

/**
 * The user of the session the app holds, asked the way the app's own API requests ask: in JWT mode with the bearer alone
 * (a fresh request context without the browser's cookies; JWT mode omits cookies on everything but the auth paths that
 * need them), in cookie mode with the browser's session cookie. Also returns the mode, for an annotation.
 */
async function sessionAsTheAppAsks(context: BrowserContext, request: APIRequestContext): Promise<{ mode?: string; user?: Record<string, unknown> }> {
  const mode = (await readAuthState(context))?.authMode;
  const jwt = await readJwtCookie(context);
  const response =
    mode === 'jwt'
      ? await request.get(`${BROWSER_API_URL}/iam/get-session`, { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} })
      : await context.request.get(`${BROWSER_API_URL}/iam/get-session`);
  return { mode, user: ((await response.json().catch(() => null)) as { user?: Record<string, unknown> } | null)?.user };
}

async function expectSignedInWithoutReload(page: Page): Promise<void> {
  await waitForURLAndHydration(page, /\/app$/);
  await expect(page.getByTestId('dashboard-email')).toHaveText(user.email);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__noReload'])).toBe(true);
}

test('enable 2FA (password hashed), sign out, sign in with the TOTP on /auth/2fa', async ({ page, context, request }) => {
  user = await createUser(request, 'twofa');
  await login(page, user);

  await fillInput(page, '#two-factor-password', user.password);
  const enable = page.waitForRequest((candidate) => isApiPost(candidate, '/iam/two-factor/enable'));
  await page.getByRole('button', { name: '2FA einrichten' }).click();
  const body = (await enable).postDataJSON() as { password: string };
  expect(body.password).toMatch(SHA256_HEX);
  expect(body.password).not.toBe(user.password);

  const uri = (await page.getByTestId('totp-uri').textContent()) ?? '';
  expect(uri).toMatch(/^otpauth:\/\/totp\//);
  secret = extractTOTPSecret(uri) ?? '';
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  backupCodes = (await page.getByTestId('backup-codes').locator('li').allTextContents()).map((code) => code.trim());
  expect(backupCodes.length).toBeGreaterThanOrEqual(2);

  await fillInput(page, '#two-factor-verify-code', generateTOTP(secret));
  await page.getByRole('button', { name: '2FA aktivieren' }).click();
  await expect(page.getByTestId('two-factor-active')).toBeVisible();
  // Switching 2FA on replaces the session, and since nest-server 12.11.0 a JWT is bound to its session: the transport
  // the app holds now (the session cookie, in JWT mode the JWT of the verify-totp answer) must still authenticate.
  const enabled = await sessionAsTheAppAsks(context, request);
  test.info().annotations.push({ description: String(enabled.mode), type: 'auth mode after switching 2FA on' });
  expect(enabled.user?.['email']).toBe(user.email);

  await page.getByRole('button', { name: 'Abmelden' }).click();
  await waitForURLAndHydration(page, /\/auth\/login$/);

  const answer = await signInExpectingSecondFactor(page);
  // nest-server's REST answer carries no Better Auth `twoFactorRedirect` (see the login page workaround).
  expect(answer).toMatchObject({ requiresTwoFactor: true });
  expect((await readAuthState(context))?.user ?? null).toBeNull();

  await fillInput(page, '#two-factor-code', generateTOTP(secret));
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await expectSignedInWithoutReload(page);
  expect(await readAuthState(context)).toMatchObject({ user: { email: user.email, twoFactorEnabled: true } });
  await expect(page.getByTestId('two-factor-active')).toBeVisible();
});

test('a wrong code is refused, a backup code signs in', async ({ page }) => {
  await signInExpectingSecondFactor(page);
  await page.getByRole('button', { name: 'Stattdessen einen Backup-Code verwenden' }).click();
  await expect(page.getByLabel('Backup-Code')).toBeVisible();

  await fillInput(page, '#two-factor-code', 'falsch-123');
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(page.getByTestId('two-factor-error')).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/2fa/);

  await fillInput(page, '#two-factor-code', backupCodes[0] ?? '');
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await expectSignedInWithoutReload(page);
});

test('after the second factor the session uses the transport the server proved, the JWT cookie only ever holds a JWT', async ({ page, context }) => {
  // Regression (fixed in 22.0.0): Better Auth answers the verification with `{ token: <session token>, user }`; the
  // token must not be taken for a JWT. Cookie runs: a cookie session plus a JWT from /iam/token. JWT runs: whatever the
  // server proved (see expectVerifiedTransport()), never the opaque session token in the JWT cookie.
  await signInExpectingSecondFactor(page, '/app');
  await fillInput(page, '#two-factor-code', generateTOTP(secret));
  const verified = page.waitForResponse((response) => isApiPost(response.request(), '/iam/two-factor/verify-totp'));
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  const answer = (await (await verified).json().catch(() => ({}))) as { token?: unknown };
  await expectSignedInWithoutReload(page);

  test.info().annotations.push({ description: String(await expectVerifiedTransport(context)), type: 'auth mode after 2FA' });
  const sessions = await readSessionCookies(context);
  const opaque = [
    typeof answer.token === 'string' && !JWT_SHAPE.test(answer.token) ? answer.token : '',
    ...sessions.map((cookie) => decodeURIComponent(cookie.value).split('.')[0] ?? ''),
  ].filter(Boolean);
  for (const token of opaque) {
    expect(await readJwtCookie(context)).not.toBe(token);
  }
});

test('switching 2FA off keeps the session and its transport (nest-server 12.11.1+: the answer carries the new JWT)', async ({ page, context, request }) => {
  // `two-factor/disable` replaces the session, and a JWT is bound to its session: in JWT runs the app must send the JWT
  // of the answer from then on. The page then updates the user with `setUser()` without a mode, which keeps the transport.
  await signInExpectingSecondFactor(page, '/app');
  await fillInput(page, '#two-factor-code', generateTOTP(secret));
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await expectSignedInWithoutReload(page);
  const mode = (await readAuthState(context))?.authMode;

  await fillInput(page, '#two-factor-disable-password', user.password);
  const disable = page.waitForRequest((candidate) => isApiPost(candidate, '/iam/two-factor/disable'));
  await page.getByRole('button', { name: '2FA deaktivieren' }).click();
  expect(((await disable).postDataJSON() as { password: string }).password).toMatch(SHA256_HEX);
  await expect(page.getByRole('button', { name: '2FA einrichten' })).toBeVisible();

  expect(await readAuthState(context)).toMatchObject({ authMode: mode, user: { email: user.email, twoFactorEnabled: false } });
  const disabled = await sessionAsTheAppAsks(context, request);
  test.info().annotations.push({ description: String(disabled.mode), type: 'auth mode after switching 2FA off' });
  expect(disabled.user).toMatchObject({ email: user.email, twoFactorEnabled: false });
});
