import { expect, test } from '@playwright/test';
import { gotoAndWaitForHydration, loginTestUserViaApi, type TestUser } from '@lenne.tech/ng-base/testing';

import { authHeaders, createUser, login } from './support/auth';
import { API_URL, AUTH_MODE, BROWSER_API_URL, SITE_URL } from './support/env';

/** Absolute form of a URL the page shows (relative `/api/…` in proxy mode). */
const absolute = (url: string) => new URL(url, SITE_URL).toString();

/** TUS upload through `<lt-tus-upload>` against nest-server's `/tus`, the stored file id and the file URLs. */
test.describe.configure({ mode: 'serial' });

let user: TestUser;
let uploaded: { content: string; downloadUrl: string; fileId: string; fileUrl: string };

test('uploads a file via TUS and shows the stored file id', async ({ page, context, request }) => {
  user = await createUser(request, 'upload');
  await login(page, user);
  await gotoAndWaitForHydration(page, '/app/upload');

  const content = `Hallo ng-base ${Date.now()}`;
  const completed = page.waitForResponse((response) => response.url().startsWith(`${BROWSER_API_URL}/tus`) && !!response.headers()['x-file-id']);
  await page.locator('lt-tus-upload input[type="file"]').setInputFiles({ buffer: Buffer.from(content), mimeType: 'text/plain', name: 'hallo.txt' });

  const fileId = (await completed).headers()['x-file-id'] ?? '';
  expect(fileId).toMatch(/^[a-f\d]{24}$/);
  await expect(page.getByTestId('file-id')).toHaveText(fileId);
  await expect(page.locator('lt-tus-upload [data-slot="status"]')).toHaveText('Hochgeladen');

  // The URLs of LtFileService point at the API (cookie mode) or at the API proxy of the app (JWT mode).
  const downloadUrl = absolute((await page.getByTestId('download-link').getAttribute('href')) ?? '');
  const fileUrl = absolute((await page.getByTestId('file-url').textContent())?.trim() ?? '');
  expect(downloadUrl.startsWith(`${BROWSER_API_URL}/files/`)).toBe(true);
  expect(downloadUrl).toContain(fileId);
  expect(fileUrl.startsWith(`${BROWSER_API_URL}/files/`)).toBe(true);
  uploaded = { content, downloadUrl, fileId, fileUrl };

  // The stored file belongs to the uploader and can be read back with the browser's credential (nest-server: GET
  // /files/id/:id): the session cookie, or the JWT in JWT mode.
  const stored = await page.request.get(`${BROWSER_API_URL}/files/id/${fileId}`, { headers: await authHeaders(context) });
  expect(stored.status()).toBe(200);
  expect(await stored.text()).toBe(content);
});

test('the file and download URLs of LtFileService serve the stored file', async ({ page }) => {
  // Regression (fixed in 22.0.0): the URLs follow nest-server 12.5's routes (`/files/id/:id`).
  const answer = await loginTestUserViaApi(page.request, user, { apiUrl: API_URL });
  const headers: Record<string, string> = AUTH_MODE === 'jwt' && typeof answer['token'] === 'string' ? { Authorization: `Bearer ${answer['token']}` } : {};
  const fileResponse = await page.request.get(uploaded.fileUrl, { headers });
  const downloadResponse = await page.request.get(uploaded.downloadUrl, { headers });
  test.info().annotations.push({ description: `${uploaded.fileUrl} → ${fileResponse.status()}, ${uploaded.downloadUrl} → ${downloadResponse.status()}`, type: 'urls' });
  expect(fileResponse.status(), uploaded.fileUrl).toBe(200);
  expect(await fileResponse.text()).toBe(uploaded.content);
  expect(downloadResponse.status(), uploaded.downloadUrl).toBe(200);
  expect(await downloadResponse.text()).toBe(uploaded.content);
});
