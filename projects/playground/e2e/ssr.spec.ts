import { expect, test, type ConsoleMessage } from '@playwright/test';
import { gotoAndWaitForHydration } from '@lenne.tech/ng-base/testing';

import { API_URL, AUTH_MODE, BUILD_IDENTITY, SERVER_API_URL, SITE_URL } from './support/env';

/**
 * SSR server (`server.ts` with the `@lenne.tech/ng-base/server` middlewares) and hydration in the browser.
 */
function runtimeConfigOf(html: string): Record<string, unknown> {
  const match = /<script id="ng-runtime-config" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  expect(match, 'runtime config script in the HTML').not.toBeNull();
  return JSON.parse(match?.[1] ?? '{}') as Record<string, unknown>;
}

test('HTML carries the public runtime config, never the server-only API URL', async ({ request }) => {
  const response = await request.get(`${SITE_URL}/`);
  expect(response.status()).toBe(200);
  const html = await response.text();

  const config = runtimeConfigOf(html);
  expect(config).toMatchObject({ apiUrl: API_URL, appCommit: BUILD_IDENTITY.commit, appVersion: BUILD_IDENTITY.version, siteUrl: SITE_URL });
  // JWT runs talk to the API through the SSR proxy (`NG_PUBLIC_API_PROXY=true`).
  expect(config['apiProxy'] ?? null).toBe(AUTH_MODE === 'jwt' ? true : null);
  expect(html).not.toContain(SERVER_API_URL);
  expect(html.indexOf('id="ng-runtime-config"'), 'first child of <head>').toBeLessThan(html.indexOf('<title>'));

  // Server-rendered content, not an empty shell.
  expect(html).toContain('ng-server-context="ssr"');
  expect(html).toContain('Playground</h1>');
  expect(html).toMatch(/KI-Modul: <strong[^>]*>aus</);
});

test('HTML responses carry the security and cache headers', async ({ request }) => {
  const response = await request.get(`${SITE_URL}/auth/login`);
  const headers = response.headers();
  expect(headers['content-type']).toContain('text/html');
  expect(headers['cache-control']).toBe('private, no-cache');
  expect(headers['vary']).toContain('Cookie');
  expect(headers).toMatchObject({
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'referrer-policy': 'strict-origin',
    'x-content-type-options': 'nosniff',
    'x-dns-prefetch-control': 'off',
    'x-frame-options': 'DENY',
    'x-permitted-cross-domain-policies': 'none',
  });
  expect(headers['x-powered-by']).toBeUndefined();
  // Plain HTTP: no HSTS.
  expect(headers['strict-transport-security']).toBeUndefined();

  // Static assets: long-lived, but still with the security headers and without the HTML no-cache.
  const asset = /<script src="(main-[^"]+\.js)"/.exec(await response.text())?.[1];
  expect(asset).toBeTruthy();
  const assetResponse = await request.get(`${SITE_URL}/${asset}`);
  expect(assetResponse.headers()['cache-control']).toContain('max-age=31536000');
  expect(assetResponse.headers()['x-content-type-options']).toBe('nosniff');
});

test('build identity and security.txt', async ({ request }) => {
  const identity = await request.get(`${SITE_URL}/api/build-identity`);
  expect(identity.headers()['cache-control']).toBe('no-store');
  expect(await identity.json()).toEqual(BUILD_IDENTITY);

  const securityTxt = await request.get(`${SITE_URL}/.well-known/security.txt`);
  expect(securityTxt.status()).toBe(200);
  expect(securityTxt.headers()['content-type']).toContain('text/plain');
  const text = await securityTxt.text();
  expect(text).toContain('Contact: mailto:security@lenne.tech');
  expect(text).toContain(`Canonical: ${SITE_URL}/.well-known/security.txt`);
  expect(text).toMatch(/Expires: \d{4}-\d{2}-\d{2}T/);
});

test('the browser hydrates the server-rendered page without errors', async ({ page }) => {
  const problems: string[] = [];
  const collect = (message: ConsoleMessage) => {
    if (message.type() === 'error' || /NG0\d{3}/.test(message.text())) {
      problems.push(message.text());
    }
  };
  page.on('console', collect);
  page.on('pageerror', (error) => problems.push(error.message));
  // Tag the server-rendered heading once the HTML is parsed and before any app script runs (readyState "interactive").
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      const heading = document.readyState === 'interactive' ? document.querySelector('h1') : null;
      if (heading) {
        (heading as unknown as Record<string, unknown>)['__fromServer'] = true;
      }
    });
  });

  await gotoAndWaitForHydration(page, '/');
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__ltNgBaseHydrated'])).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__ltNgBaseVersion'])).toMatch(/^\d+\.\d+\.\d+/);
  // The browser read the same runtime config the server wrote.
  const apiUrl = await page.evaluate(() => (JSON.parse(document.getElementById('ng-runtime-config')?.textContent ?? '{}') as { apiUrl?: string }).apiUrl);
  expect(apiUrl).toBe(API_URL);

  // Hydrated, not re-rendered: the heading is still the DOM node the server sent.
  expect(await page.evaluate(() => (document.querySelector('h1') as unknown as Record<string, unknown> | null)?.['__fromServer'])).toBe(true);
  // And interactive: a router link navigates client-side.
  await page.getByRole('link', { name: 'Toast und Dialog' }).click();
  await expect(page).toHaveURL(/\/demo$/);
  expect(problems).toEqual([]);
});
