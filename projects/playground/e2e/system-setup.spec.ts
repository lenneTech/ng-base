import { expect, test } from '@playwright/test';
import { fillInput, gotoAndWaitForHydration, waitForURLAndHydration } from '@lenne.tech/ng-base/testing';

import { isApiPost, login, SHA256_HEX } from './support/auth';
import { ADMIN, API_URL } from './support/env';

/**
 * First-admin setup on a fresh database (setup project: runs before every other spec). Proves the guard matrix of
 * `ltSystemSetupGuard` on the server (SSR redirect) and in the browser, and `LtSystemSetupService.initSetup()`.
 */
test.describe.configure({ mode: 'serial' });

test('every route leads to /auth/setup while no admin exists', async ({ page, request }) => {
  const status = await (await request.get(`${API_URL}/system-setup/status`)).json();
  expect(status, 'the run needs a fresh database').toMatchObject({ needsSetup: true });

  for (const path of ['/', '/auth/login', '/auth/register', '/app', '/demo']) {
    await gotoAndWaitForHydration(page, path);
    await expect(page, `${path} → setup`).toHaveURL(/\/auth\/setup$/);
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Ersteinrichtung' })).toBeVisible();
});

test('creates the first admin (password hashed) and leaves the setup page for good', async ({ page, request }) => {
  await gotoAndWaitForHydration(page, '/auth/setup');
  await fillInput(page, '#setup-name', ADMIN.name);
  await fillInput(page, '#setup-email', ADMIN.email);
  await fillInput(page, '#setup-password', ADMIN.password);

  const initRequest = page.waitForRequest((candidate) => isApiPost(candidate, '/system-setup/init'));
  await page.getByRole('button', { name: 'Administrator anlegen' }).click();
  const body = (await initRequest).postDataJSON() as { email: string; name: string; password: string };
  expect(body.email).toBe(ADMIN.email);
  expect(body.password).toMatch(SHA256_HEX);
  expect(body.password).not.toBe(ADMIN.password);

  await waitForURLAndHydration(page, /\/auth\/login\?setup=done$/);
  await expect(page.getByText('Administrator angelegt')).toBeVisible();
  expect(await (await request.get(`${API_URL}/system-setup/status`)).json()).toMatchObject({ needsSetup: false });

  // Setup done: the setup page sends to the login page (fresh SSR request), the rest of the app is open again.
  await gotoAndWaitForHydration(page, '/auth/setup');
  await expect(page).toHaveURL(/\/auth\/login$/);
  await gotoAndWaitForHydration(page, '/');
  await expect(page).toHaveURL(/\/$/);
});

test('the admin signs in and reaches the admin page (ltRoleGuard)', async ({ page }) => {
  await login(page, ADMIN);
  await expect(page.getByTestId('dashboard-email')).toHaveText(ADMIN.email);
  await page.getByRole('link', { name: 'Administration' }).first().click();
  await waitForURLAndHydration(page, /\/app\/admin$/);
  await expect(page.getByTestId('admin-content')).toContainText(ADMIN.email);

  // Server-rendered as well: a hard load of the admin page keeps the admin there.
  await gotoAndWaitForHydration(page, '/app/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible();
});
