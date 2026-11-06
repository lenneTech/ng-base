import { expect, type APIRequestContext, type BrowserContext, type Page, type Request } from '@playwright/test';
import { createTestUser, loginTestUser, type TestUser } from '@lenne.tech/ng-base/testing';

import { API_URL, AUTH_MODE, BROWSER_API_URL, SITE_URL } from './env';

/**
 * Ids of the login fields. Signal Forms name the inputs after the form (`login.email`), so the helpers' default
 * `input[name="email"]` does not match; the ids are stable.
 */
export const LOGIN_FIELDS = { email: '#login-email', password: '#login-password' } as const;

/** SHA-256 hex as the browser sends every credential. */
export const SHA256_HEX = /^[a-f\d]{64}$/;

/** Content of the client-readable auth-state cookie. */
export interface AuthStateCookie {
  authMode?: string;
  user?: { email?: string; id?: string; twoFactorEnabled?: boolean } | null;
}

/** A user created through the API (sign-up with the terms flag the backend's `signUpChecks` require). */
export async function createUser(request: APIRequestContext, prefix: string): Promise<TestUser> {
  const { user } = await createTestUser(request, { apiUrl: API_URL, extra: { termsAndPrivacyAccepted: true }, prefix });
  return user;
}

/** Sign in through the login form and wait for `/app` (or `expectUrl`). */
export function login(page: Page, user: Pick<TestUser, 'email' | 'password'>, expectUrl?: RegExp | string | null): Promise<void> {
  return loginTestUser(page, user, { emailSelector: LOGIN_FIELDS.email, passwordSelector: LOGIN_FIELDS.password, ...(expectUrl === undefined ? {} : { expectUrl }) });
}

/** The parsed `lt-auth-state` cookie of the app origin, or `null`. */
export async function readAuthState(context: BrowserContext): Promise<AuthStateCookie | null> {
  const cookie = (await context.cookies(SITE_URL)).find((entry) => entry.name === 'lt-auth-state');
  return cookie ? (JSON.parse(decodeURIComponent(cookie.value)) as AuthStateCookie) : null;
}

/** Whether `request` is a POST of the browser to the API path `path` (e.g. `/iam/sign-in/email`). */
export function isApiPost(request: Request, path: string): boolean {
  return request.method() === 'POST' && request.url().split('?')[0] === `${BROWSER_API_URL}${path}`;
}

/** The value of the script-readable `lt-jwt-token` cookie of the app origin (the raw JWT), or `null`. */
export async function readJwtCookie(context: BrowserContext): Promise<string | null> {
  const cookie = (await context.cookies(SITE_URL)).find((entry) => entry.name === 'lt-jwt-token');
  return cookie ? decodeURIComponent(cookie.value) : null;
}

/** JWT shape (`header.payload.signature`, base64url). */
export const JWT_SHAPE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

/**
 * Headers that authenticate a Playwright request like the browser does: none in cookie mode (the context carries the
 * session cookie), `Authorization: Bearer <JWT>` from the JWT cookie in JWT mode.
 */
export async function authHeaders(context: BrowserContext): Promise<Record<string, string>> {
  if (AUTH_MODE === 'cookie') {
    return {};
  }
  const jwt = await readJwtCookie(context);
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

/**
 * Session cookie of the API (`iam.session_token`), on the API origin or (proxied) on the app origin. One call with both
 * URLs: Playwright's URL filter ignores the port, so two calls would return the same `localhost` cookie twice.
 */
export async function readSessionCookies(context: BrowserContext) {
  return (await context.cookies([API_URL, SITE_URL])).filter((cookie) => cookie.name.endsWith('session_token'));
}

/**
 * After a 2FA or passkey sign-in the store uses the transport the server proved. Cookie runs stay in cookie mode. In JWT
 * runs nest-server 12.6 still answers these forwarded Better Auth routes with its session cookie (same-origin through
 * the proxy); later releases put a JWT into the answer. Either way: a cookie session has its httpOnly cookie, and the
 * script-readable JWT cookie only ever holds a JWT. Returns the mode for an annotation.
 */
export async function expectVerifiedTransport(context: BrowserContext): Promise<string | undefined> {
  const mode = (await readAuthState(context))?.authMode;
  expect(AUTH_MODE === 'cookie' ? ['cookie'] : ['cookie', 'jwt']).toContain(mode);
  if (mode === 'cookie') {
    const sessions = await readSessionCookies(context);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.httpOnly).toBe(true);
  }
  await expect.poll(() => readJwtCookie(context), { timeout: 5000 }).toMatch(JWT_SHAPE);
  return mode;
}
