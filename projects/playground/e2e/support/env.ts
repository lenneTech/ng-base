/**
 * Fixed endpoints of the E2E run. The ports are not configurable on purpose: nest-server's e2e environment trusts the
 * origin `http://localhost:3001` (Better Auth CSRF check, passkey origin, rpId `localhost`), other ports fail with
 * INVALID_ORIGIN.
 */
export const API_URL = 'http://localhost:3000';
export const SITE_URL = 'http://localhost:3001';
/**
 * Auth transport of the run (`NG_BASE_E2E_AUTH_MODE`):
 * - `cookie` (default): nest-server with session cookies, the browser calls `API_URL` cross-origin.
 * - `jwt`: nest-server's real JWT mode (`NSC__COOKIES=false`, top-level `cookies: false`; `betterAuth.cookies` does
 *   not switch it, and `/iam/features` `jwt` only reports the plugin). The browser calls the API same-origin through
 *   the SSR proxy (`NG_PUBLIC_API_PROXY=true`, `/api`): nest-server before 12.7.0 answers CORS with a wildcard
 *   origin without credentials in this mode, which the browser blocks cross-origin.
 */
export const AUTH_MODE: 'cookie' | 'jwt' = process.env['NG_BASE_E2E_AUTH_MODE'] === 'jwt' ? 'jwt' : 'cookie';
/** API base URL as the browser calls it: `API_URL` in cookie mode, the proxy `SITE_URL/api` in JWT mode. */
export const BROWSER_API_URL = AUTH_MODE === 'jwt' ? `${SITE_URL}/api` : API_URL;
/** Server-only API URL of the SSR server (`NG_API_URL`): it must never reach the browser. */
export const SERVER_API_URL = 'http://127.0.0.1:3000';
/** Own database of the run, dropped before the API starts. Never point this at another database. */
export const E2E_DB_NAME = 'ng-base-playground-e2e';
export const E2E_DB_URI = `mongodb://127.0.0.1/${E2E_DB_NAME}`;
/** Build identity the SSR server reports (`/api/build-identity`). */
export const BUILD_IDENTITY = { commit: 'e2e-commit', version: '22.0.0-e2e' };
/** First administrator, created by `system-setup.spec.ts` (setup project, runs before every other spec). */
export const ADMIN = { email: 'admin@playground.test', name: 'Playground Admin', password: 'Admin-Passwort-2026!' };
