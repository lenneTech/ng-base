import { expect, test } from '@playwright/test';
import { gotoAndWaitForHydration } from '@lenne.tech/ng-base/testing';

import { API_URL } from './support/env';

/** AI status line, toast and confirmation dialog. */
test('AI status follows the backend without errors and without a second request', async ({ page, request }) => {
  // The e2e backend of nest-server-starter has no AI module: GET /ai/status answers 404 ("off").
  const aiOn = (await request.get(`${API_URL}/ai/status`)).ok();
  const problems: string[] = [];
  const browserStatusRequests: string[] = [];
  page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
  page.on('request', (candidate) => candidate.url().includes('/ai/status') && browserStatusRequests.push(candidate.url()));

  await gotoAndWaitForHydration(page, '/');
  await expect(page.getByTestId('ai-status')).toHaveAttribute('data-state', aiOn ? 'an' : 'aus');
  await expect(page.getByTestId('ai-status')).toContainText(`KI-Modul: ${aiOn ? 'an' : 'aus'}`);
  await expect(page.getByTestId('ai-status-error')).toHaveCount(0);
  // Read on the server and handed over via TransferState.
  expect(browserStatusRequests).toEqual([]);
  expect(problems).toEqual([]);
});

test('a toast appears', async ({ page }) => {
  await gotoAndWaitForHydration(page, '/demo');
  await page.getByRole('button', { name: 'Toast anzeigen' }).click();
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Gespeichert' });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Der Toast aus dem Playground funktioniert.');
});

test('the confirmation dialog: Escape cancels, Enter and the button confirm', async ({ page }) => {
  await gotoAndWaitForHydration(page, '/demo');
  const trigger = page.getByRole('button', { name: 'Bestätigung anfragen' });
  const dialog = page.getByRole('alertdialog', { name: 'Wirklich fortfahren?' });
  const answer = page.getByTestId('confirm-answer');

  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Diese Aktion lässt sich im Playground gefahrlos ausprobieren.');
  // Non-destructive question: the focus starts on the confirm button.
  await expect(dialog.getByRole('button', { name: 'Fortfahren' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(answer).toHaveText('Antwort: abgebrochen');
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fortfahren' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(answer).toHaveText('Antwort: bestätigt');

  await trigger.click();
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(answer).toHaveText('Antwort: abgebrochen');
});
