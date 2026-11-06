/// <reference types="node" />
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { createHash } from 'node:crypto';

import { fillInput, generateTestUser, gotoAndWaitForHydration, type TestUser, waitForURLAndHydration } from './playwright-helpers';

/** SHA-256 hex of a password, as the browser sends it (nest-server expects hashed passwords). */
export function hashTestPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

/** Options of {@link createTestUser}. */
export interface CreateTestUserOptions {
  /** API base URL, e.g. `http://localhost:3000` (default `NG_API_URL` / `NG_PUBLIC_API_URL`, else `http://localhost:3000`). */
  apiUrl?: string;
  /** Better Auth base path (default `/iam`). */
  basePath?: string;
  /** Extra sign-up fields (e.g. `termsAndPrivacyAccepted: true` when the backend's `signUpChecks` require it). */
  extra?: Record<string, unknown>;
  /** Prefix for the generated email (default `e2e`). */
  prefix?: string;
  /** Use this user instead of a generated one. */
  user?: TestUser;
}

/** Result of {@link createTestUser}. */
export interface CreatedTestUser {
  response: APIResponse;
  /** Response body (`{ token?, user }`). */
  body: Record<string, unknown> | null;
  user: TestUser;
}

/**
 * Create a user through the API (`POST <api>/iam/sign-up/email`, password hashed like the browser does). Fails the
 * test with the response text when sign-up does not answer 2xx.
 *
 * @example
 * const { user } = await createTestUser(request, { extra: { termsAndPrivacyAccepted: true } });
 * await loginTestUser(page, user);
 */
export async function createTestUser(request: APIRequestContext, options: CreateTestUserOptions = {}): Promise<CreatedTestUser> {
  const user = options.user ?? generateTestUser(options.prefix);
  const response = await request.post(`${resolveApiUrl(options.apiUrl)}${options.basePath ?? '/iam'}/sign-up/email`, {
    data: { email: user.email, name: user.name, password: hashTestPassword(user.password), ...options.extra },
  });
  if (!response.ok()) {
    throw new Error(`createTestUser: sign-up failed with ${response.status()}: ${await response.text()}`);
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  return { body, response, user };
}

/** Options of {@link loginTestUser}. */
export interface LoginTestUserOptions {
  /** Selector of the email input (default: an input with `autocomplete="email"`/`"username"`, `type="email"` or `name="email"`). */
  emailSelector?: string;
  /** URL (or pattern) expected after the login (default `/app`). Pass `null` to skip the wait. */
  expectUrl?: RegExp | string | null;
  /** Login page (default `/auth/login`). */
  loginPath?: string;
  /** Selector of the password input (default: `autocomplete="current-password"`, else the first `type="password"`). */
  passwordSelector?: string;
  /** Selector of the submit button (default `button[type="submit"]`). */
  submitSelector?: string;
}

/** Sign in through the login form (waits for hydration first) and wait for the target page. */
export async function loginTestUser(page: Page, user: Pick<TestUser, 'email' | 'password'>, options: LoginTestUserOptions = {}): Promise<void> {
  await gotoAndWaitForHydration(page, options.loginPath ?? '/auth/login');
  // Signal Forms name fields by their path (`login.email`), so the defaults match on autocomplete/type instead of name.
  const email = options.emailSelector ?? 'input[autocomplete="email"], input[autocomplete="username"], input[type="email"], input[name="email"]';
  const password = options.passwordSelector ?? 'input[autocomplete="current-password"], input[type="password"]';
  await fillInput(page, `:is(${email}) >> nth=0`, user.email);
  await fillInput(page, `:is(${password}) >> nth=0`, user.password);
  await page.click(options.submitSelector ?? 'button[type="submit"]');
  const expectUrl = options.expectUrl === undefined ? /\/app(\/|$|\?)/ : options.expectUrl;
  if (expectUrl !== null) {
    await waitForURLAndHydration(page, expectUrl);
  }
}

/**
 * Sign in through the API (`POST <api>/iam/sign-in/email`); the request context keeps the session cookie for later
 * API calls. Returns the response body (`{ token?, user }`).
 */
export async function loginTestUserViaApi(
  request: APIRequestContext,
  user: Pick<TestUser, 'email' | 'password'>,
  options: Pick<CreateTestUserOptions, 'apiUrl' | 'basePath'> = {},
): Promise<Record<string, unknown>> {
  const response = await request.post(`${resolveApiUrl(options.apiUrl)}${options.basePath ?? '/iam'}/sign-in/email`, {
    data: { email: user.email, password: hashTestPassword(user.password) },
  });
  if (!response.ok()) {
    throw new Error(`loginTestUserViaApi: sign-in failed with ${response.status()}: ${await response.text()}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function resolveApiUrl(explicit?: string): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return (explicit || env['NG_API_URL'] || env['NG_PUBLIC_API_URL'] || 'http://localhost:3000').replace(/\/+$/, '');
}
