import { expect, test } from '@playwright/test';
import { gotoAndWaitForHydration, waitForURLAndHydration } from '@lenne.tech/ng-base/testing';

import { createUser, expectVerifiedTransport, isApiPost, login, readAuthState } from './support/auth';

/** Passkey registration on /app and passkey sign-in, with Chromium's virtual WebAuthn authenticator (CDP). */
test('register a passkey, sign out, sign in with the passkey', async ({ page, context, request }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { hasResidentKey: true, hasUserVerification: true, isUserVerified: true, protocol: 'ctap2', transport: 'internal' },
  });

  const user = await createUser(request, 'passkey');
  await login(page, user);

  const verifyRegistration = page.waitForRequest((candidate) => isApiPost(candidate, '/iam/passkey/verify-registration'));
  await page.getByRole('button', { name: 'Passkey hinzufügen' }).click();
  // nest-server binds the WebAuthn challenge to a challengeId instead of a cookie.
  expect(((await verifyRegistration).postDataJSON() as { challengeId?: string }).challengeId).toBeTruthy();
  await expect(page.getByTestId('passkey-registered')).toBeVisible();
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  expect(credentials).toHaveLength(1);
  expect(credentials[0]?.isResidentCredential).toBe(true);
  expect(credentials[0]?.rpId).toBe('localhost');

  await page.getByRole('button', { name: 'Abmelden' }).click();
  await waitForURLAndHydration(page, /\/auth\/login$/);
  expect((await readAuthState(context))?.user ?? null).toBeNull();

  // Fresh page load of the login page: the passkey button depends on the feature flags transferred from SSR.
  await gotoAndWaitForHydration(page, '/auth/login');
  const verifyAuthentication = page.waitForResponse((response) => isApiPost(response.request(), '/iam/passkey/verify-authentication'));
  await page.getByRole('button', { name: 'Mit Passkey anmelden' }).click();
  expect((await verifyAuthentication).ok()).toBe(true);
  await waitForURLAndHydration(page, /\/app$/);
  await expect(page.getByTestId('dashboard-email')).toHaveText(user.email);
  expect(await readAuthState(context)).toMatchObject({ user: { email: user.email } });
  test.info().annotations.push({ description: String(await expectVerifiedTransport(context)), type: 'auth mode after passkey' });

  // The session is real: a hard reload keeps the user signed in.
  await gotoAndWaitForHydration(page, '/app');
  await expect(page.getByTestId('dashboard-email')).toHaveText(user.email);
});
