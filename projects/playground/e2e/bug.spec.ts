import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fillInput, gotoAndWaitForHydration } from '@lenne.tech/ng-base/testing';
import { createHash } from 'node:crypto';

import { createUser, login, readJwtCookie, readSessionCookies } from './support/auth';
import { SITE_URL } from './support/env';

/**
 * Bug reporter (`@lenne.tech/ng-base/bug`): on in the `e2e` stage, the report carries no credential, the dialog passes
 * AXE, and the server endpoint (`ltBugReport()`) answers without Linear credentials with a generic error.
 */

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const REPORT_PATH = '/_bug-lt/report';

/** Open the dialog from the floating button (deferred on idle) and fill the required fields. */
async function openAndFillReport(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Fehler melden' }).click();
  await expect(page.getByRole('dialog', { name: 'Fehler melden' })).toBeVisible();
  await fillInput(page, '#lt-bug-title', 'E2E: Knopf reagiert nicht');
  await page.locator('#lt-bug-type').click();
  await page.getByRole('option', { name: 'Bug' }).click();
  await fillInput(page, '#lt-bug-description', 'Nach der Anmeldung passiert beim Klick nichts.');
}

test('the report carries no password, session token or JWT, and the dialog names the created ticket', async ({ page, context, request }) => {
  const user = await createUser(request, 'bug');
  await login(page, user);
  await gotoAndWaitForHydration(page, '/app');
  await expect(page.getByTestId('dashboard-email')).toHaveText(user.email);
  // The capture engine loads lazily; once it wraps fetch, an authenticated call with the password in its body follows.
  await page.waitForFunction(() => !String(window.fetch).includes('[native code]'));
  await fillInput(page, '#two-factor-password', user.password);
  const enable = page.waitForResponse((response) => response.url().endsWith('/iam/two-factor/enable'));
  await page.getByRole('button', { name: '2FA einrichten' }).click();
  expect((await enable).ok()).toBe(true);
  const jwt = await readJwtCookie(context);
  const sessions = (await readSessionCookies(context)).map((cookie) => decodeURIComponent(cookie.value));

  let payload = '';
  await page.route(`${SITE_URL}${REPORT_PATH}`, async (route) => {
    payload = route.request().postData() ?? '';
    await route.fulfill({ json: { identifier: 'DEV-4711', issueId: 'issue-1', issueUrl: 'https://linear.app/x/issue/DEV-4711', success: true } });
  });
  await openAndFillReport(page);
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Ticket DEV-4711 wurde angelegt.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Fehler melden' })).toBeHidden();

  const report = JSON.parse(payload) as Record<string, unknown>;
  expect(report).toMatchObject({ title: 'E2E: Knopf reagiert nicht', type: 'bug' });
  // The capture ran (the 2FA call is in the report) …
  expect(payload).toContain('/iam/two-factor/enable');
  // … but no credential: not the password, not its SHA-256 (the sign-in body), no session token, no JWT.
  expect(payload).not.toContain(user.password);
  expect(payload).not.toContain(createHash('sha256').update(user.password).digest('hex'));
  for (const secret of [jwt, ...sessions].filter((value): value is string => !!value)) {
    expect(payload).not.toContain(secret);
    expect(payload).not.toContain(secret.split('.')[0] ?? secret);
  }
});

test('the bug report dialog passes AXE (WCAG 2.2 AA)', async ({ page }) => {
  await gotoAndWaitForHydration(page, '/auth/login');
  await page.getByRole('button', { name: 'Fehler melden' }).click();
  await expect(page.getByRole('dialog', { name: 'Fehler melden' })).toBeVisible();
  // The submit without input shows the field errors, so they are checked too.
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.locator('#lt-bug-title')).toBeFocused();
  const { violations } = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(WCAG_AA).analyze();
  expect(violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Fehler melden' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Fehler melden' })).toBeFocused();
});

test('the endpoint is on in the e2e stage and answers without Linear credentials with a generic error', async ({ page }) => {
  await gotoAndWaitForHydration(page, '/auth/login');
  const answer = page.waitForResponse((response) => response.url() === `${SITE_URL}${REPORT_PATH}`);
  await openAndFillReport(page);
  await page.getByRole('button', { name: 'Senden' }).click();
  const response = await answer;
  expect(response.status()).toBe(500);
  expect(await response.json()).toEqual({ error: 'Bug reporting is not configured on the server', success: false });
  await expect(page.getByText('Fehlerbericht konnte nicht gesendet werden')).toBeVisible();
  // The dialog stays open with the error, so nothing typed is lost.
  await expect(page.locator('[data-slot="bug-report-error"]')).toContainText('Bitte versuchen Sie es später erneut.');
  await expect(page.locator('#lt-bug-title')).toHaveValue('E2E: Knopf reagiert nicht');
});
