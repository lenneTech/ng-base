import { expect, test, type Page } from '@playwright/test';
import { extractTOTPSecret, fillInput, generateTOTP, gotoAndWaitForHydration, waitForURLAndHydration } from '@lenne.tech/ng-base/testing';

import { createUser, expectVerifiedTransport, isApiPost, JWT_SHAPE, LOGIN_FIELDS, login, readAuthState, readJwtCookie, readSessionCookies, SHA256_HEX } from './support/auth';

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
