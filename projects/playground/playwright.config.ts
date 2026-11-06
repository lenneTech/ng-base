import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { API_URL, AUTH_MODE, BUILD_IDENTITY, E2E_DB_URI, SERVER_API_URL, SITE_URL } from './e2e/support/env';

/**
 * Library E2E: the playground (built, SSR, :3001) against a real nest-server-starter (:3000) with its own database.
 *
 * API checkout: `NG_BASE_E2E_API_DIR`, default the sibling `../nest-server-starter`. It must be installed and built
 * (`pnpm install --frozen-lockfile && pnpm run build`). Use a clone of your own when you work in that checkout.
 *
 * Both servers are started here and never reused (`reuseExistingServer: false`): a foreign process on :3000/:3001 makes
 * the run fail instead of testing somebody else's server. Set `NG_BASE_E2E_PREBUILT=true` to skip the playground build.
 *
 * API environment on top of `NODE_ENV=e2e`:
 * - `NSC__MONGOOSE__URI`: own database `ng-base-playground-e2e`, dropped before the API starts (`e2e/support/reset-test-db.mjs`).
 * - `NSC__BETTER_AUTH__EMAIL_VERIFICATION=false`: a sign-up signs in directly (with verification on, every test user
 *   would need the token from the API log). The verification answer itself is covered with a stubbed response.
 * - `NSC__EXEC_AFTER_INIT=false`: no `pnpm dlx spectaql` docs build after every start.
 *
 * Auth mode (`NG_BASE_E2E_AUTH_MODE`, see `e2e/support/env.ts`): `cookie` (default) or `jwt`, which adds
 * `NSC__COOKIES=false` to the API and `NG_PUBLIC_API_PROXY=true` to the playground. Run both before a release:
 * `pnpm test:e2e` and `NG_BASE_E2E_AUTH_MODE=jwt pnpm test:e2e`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, '../..');
const apiDir = resolve(process.env['NG_BASE_E2E_API_DIR'] || join(workspace, '../nest-server-starter'));
const apiEntry = join(apiDir, 'dist/src/main.js');
if (!existsSync(apiEntry)) {
  throw new Error(`[e2e] ${apiEntry} is missing. Point NG_BASE_E2E_API_DIR to an installed and built nest-server-starter.`);
}
const prebuilt = process.env['NG_BASE_E2E_PREBUILT'] === 'true';

export default defineConfig({
  testDir: './e2e',
  outputDir: `./test-results/${AUTH_MODE}`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env['CI'],
  globalTimeout: 20 * 60 * 1000,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: `./playwright-report/${AUTH_MODE}` }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: SITE_URL,
    // German UI and German backend error texts (the library picks the browser language).
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // The first admin must exist before anything else: while none exists, every route redirects to /auth/setup.
    { name: 'setup', testMatch: /system-setup\.spec\.ts/ },
    { name: 'chromium', dependencies: ['setup'], testIgnore: /system-setup\.spec\.ts/ },
  ],
  webServer: [
    {
      name: 'API',
      command: `node "${join(here, 'e2e/support/reset-test-db.mjs')}" && node dist/src/main.js`,
      cwd: apiDir,
      env: {
        NODE_ENV: 'e2e',
        NSC__BETTER_AUTH__EMAIL_VERIFICATION: 'false',
        NSC__EXEC_AFTER_INIT: 'false',
        NSC__MONGOOSE__URI: E2E_DB_URI,
        ...(AUTH_MODE === 'jwt' ? { NSC__COOKIES: 'false' } : {}),
      },
      url: `${API_URL}/iam/features`,
      reuseExistingServer: false,
      timeout: 240_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'Playground',
      command: `${prebuilt ? '' : 'pnpm exec ng build playground && '}node dist/playground/server/server.mjs`,
      cwd: workspace,
      env: {
        NG_API_URL: SERVER_API_URL,
        NG_PUBLIC_API_URL: API_URL,
        // Stage name as nest-server's NODE_ENV block; turns the bug reporter on (it is off in production).
        NG_PUBLIC_APP_ENV: 'e2e',
        NG_PUBLIC_APP_COMMIT: BUILD_IDENTITY.commit,
        NG_PUBLIC_APP_VERSION: BUILD_IDENTITY.version,
        NG_PUBLIC_SITE_URL: SITE_URL,
        ...(AUTH_MODE === 'jwt' ? { NG_PUBLIC_API_PROXY: 'true' } : {}),
        PORT: new URL(SITE_URL).port,
      },
      url: `${SITE_URL}/api/build-identity`,
      reuseExistingServer: false,
      timeout: 240_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
