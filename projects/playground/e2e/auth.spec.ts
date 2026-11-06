import { expect, test, type Locator, type Page } from '@playwright/test';
import { fillInput, generateTestUser, gotoAndWaitForHydration, waitForHydration, waitForURLAndHydration } from '@lenne.tech/ng-base/testing';

import { authHeaders, createUser, isApiPost, JWT_SHAPE, login, LOGIN_FIELDS, readAuthState, readJwtCookie, readSessionCookies, SHA256_HEX } from './support/auth';
import { API_URL, AUTH_MODE, BROWSER_API_URL, SITE_URL } from './support/env';

/** Sign-up, sign-in, sign-out, session restore, guards and error translation through the real pages. */

test('register: the password leaves the browser hashed and the user is signed in', async ({ page, context }) => {
  const user = generateTestUser('register');
  await gotoAndWaitForHydration(page, '/auth/register');
  await fillInput(page, '#register-name', user.name);
  await fillInput(page, '#register-email', user.email);
  await fillInput(page, '#register-password', user.password);
  // The backend's signUpChecks require the terms flag; without it the form refuses to submit.
  await page.getByRole('button', { name: 'Konto anlegen' }).click();
  await expect(page.getByText('Bitte akzeptiere die AGB und die Datenschutzerklärung.')).toBeVisible();
  await page.getByLabel('Ich akzeptiere die AGB und die Datenschutzerklärung.').check();

  const signUp = page.waitForRequest((request) => isApiPost(request, '/iam/sign-up/email'));
  await page.getByRole('button', { name: 'Konto anlegen' }).click();
  const body = (await signUp).postDataJSON() as Record<string, unknown>;
  expect(body).toMatchObject({ email: user.email, name: user.name, termsAndPrivacyAccepted: true });
  expect(body['password']).toMatch(SHA256_HEX);
  expect(body['password']).not.toBe(user.password);
  expect(JSON.stringify(body)).not.toContain(user.password);

  await waitForURLAndHydration(page, /\/app$/);
  await expect(page.getByTestId('dashboard-email')).toHaveText(user.email);

  const state = await readAuthState(context);
  expect(state).toMatchObject({ authMode: AUTH_MODE, user: { email: user.email } });
  const sessions = await readSessionCookies(context);
  if (AUTH_MODE === 'cookie') {
    expect(sessions, 'session cookie of the API').toHaveLength(1);
    expect(sessions[0]?.httpOnly).toBe(true);
  } else {
    // Real JWT mode: no session cookie anywhere, the JWT from the sign-up answer authenticates.
    expect(sessions).toHaveLength(0);
    expect(await readJwtCookie(context)).toMatch(JWT_SHAPE);
  }
});

test('the JWT cookie alone authenticates against the API: it holds the raw JWT nest-server reads', async ({ page, context, request, playwright }) => {
  const user = await createUser(request, 'jwt-cookie');
  await login(page, user);
  // Cookie runs prefetch the JWT in the background; JWT runs store it with the sign-in answer.
  await expect.poll(() => readJwtCookie(context), { timeout: 5000 }).toMatch(JWT_SHAPE);
  const cookie = (await context.cookies(SITE_URL)).find((entry) => entry.name === 'lt-jwt-token');
  expect(cookie?.value, 'raw JWT, not JSON-quoted (%22…%22)').toMatch(JWT_SHAPE);
  const userId = (await readAuthState(context))?.user?.id ?? '';
  expect(userId).toBeTruthy();

  // A fresh client without session cookie and without Authorization header: only lt-jwt-token.
  const api = await playwright.request.newContext();
  try {
    expect((await api.get(`${API_URL}/users/${userId}`)).status()).toBeGreaterThanOrEqual(401);
    const viaCookie = await api.get(`${API_URL}/users/${userId}`, { headers: { cookie: `lt-jwt-token=${cookie?.value ?? ''}` } });
    expect(viaCookie.status()).toBe(200);
    expect(((await viaCookie.json()) as { email?: string }).email).toBe(user.email);
  } finally {
    await api.dispose();
  }
});

test('register: an answer that requires e-mail verification does not sign in', async ({ page, context }) => {
  const user = generateTestUser('verify');
  // nest-server's answer with `betterAuth.emailVerification` on (session revoked, no cookie); stubbed because the run
  // keeps verification off.
  await page.route(`${BROWSER_API_URL}/iam/sign-up/email`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: { emailVerificationRequired: true, requiresTwoFactor: false, success: true, user: { email: user.email, id: '6650a1b2c3d4e5f6a7b8c9d0', name: user.name } },
      status: 201,
    }),
  );
  await gotoAndWaitForHydration(page, '/auth/register');
  await fillInput(page, '#register-name', user.name);
  await fillInput(page, '#register-email', user.email);
  await fillInput(page, '#register-password', user.password);
  await page.getByLabel('Ich akzeptiere die AGB und die Datenschutzerklärung.').check();
  await page.getByRole('button', { name: 'Konto anlegen' }).click();

  await expect(page.getByTestId('register-verify')).toBeVisible();
  expect((await readAuthState(context))?.user ?? null).toBeNull();
  await gotoAndWaitForHydration(page, '/app');
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fapp$/);
});

test('login, reload with the server-rendered signed-in shell, logout', async ({ page, context, request }) => {
  const user = await createUser(request, 'login');
  const signIn = page.waitForRequest((candidate) => isApiPost(candidate, '/iam/sign-in/email'));
  await login(page, user);
  const body = (await signIn).postDataJSON() as Record<string, unknown>;
  expect(body['password']).toMatch(SHA256_HEX);
  await expect(page.getByTestId('dashboard-email')).toHaveText(user.email);
  // Cookie mode: the JWT fallback is prefetched from /iam/token into the script-readable JWT cookie. JWT mode: the
  // JWT of the sign-in answer is the only credential.
  expect((await readAuthState(context))?.authMode).toBe(AUTH_MODE);
  await expect.poll(() => readJwtCookie(context), { timeout: 5000 }).toMatch(JWT_SHAPE);

  // The server renders the signed-in shell from the auth-state cookie (no flash of the login page).
  const html = await (await page.request.get(`${SITE_URL}/app`)).text();
  expect(html).toContain(user.email);
  expect(html).toContain('Abmelden');

  await page.reload();
  await waitForHydration(page);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('dashboard-email')).toHaveText(user.email);

  // Guest guard: a signed-in user is sent from the guest pages to /app (on the server and in the browser).
  for (const path of ['/auth/login', '/auth/register']) {
    await gotoAndWaitForHydration(page, path);
    await expect(page, path).toHaveURL(/\/app$/);
  }

  const signOut = page.waitForRequest((candidate) => isApiPost(candidate, '/iam/sign-out'));
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await signOut;
  await waitForURLAndHydration(page, /\/auth\/login$/);
  expect((await readAuthState(context))?.user ?? null).toBeNull();

  // Signed out for real: the API has no session for the browser any more, and no credential is left in the browser.
  expect(await readJwtCookie(context)).toBeNull();
  const sessionResponse = await page.request.get(`${BROWSER_API_URL}/iam/get-session`, { headers: await authHeaders(context) });
  expect(await sessionResponse.text()).toMatch(/^(null)?$/);
});

test('auth guard: a signed-out visit to a protected page goes to the login page and back', async ({ page, request }) => {
  const user = await createUser(request, 'guard');
  await gotoAndWaitForHydration(page, '/app/upload');
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fapp%2Fupload$/);

  await fillInput(page, LOGIN_FIELDS.email, user.email);
  await fillInput(page, LOGIN_FIELDS.password, user.password);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await waitForURLAndHydration(page, /\/app\/upload$/);

  // Role guard: no admin role → away from the admin page.
  await gotoAndWaitForHydration(page, '/app/admin');
  await expect(page).toHaveURL(`${SITE_URL}/`);
});

test('a wrong password shows the German backend message instead of the error code', async ({ page, request }) => {
  const user = await createUser(request, 'wrong-password');
  await gotoAndWaitForHydration(page, '/auth/login');
  await fillInput(page, LOGIN_FIELDS.email, user.email);
  await fillInput(page, LOGIN_FIELDS.password, `${user.password}-falsch`);
  const answer = page.waitForResponse((response) => isApiPost(response.request(), '/iam/sign-in/email'));
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();

  const response = await answer;
  expect(response.status()).toBe(401);
  const { message } = (await response.json()) as { message: string };
  const code = /^#(LTNS_\d+):/.exec(message)?.[1];
  expect(code, `backend message ${message}`).toBeTruthy();
  const translations = (await (await request.get(`${API_URL}/i18n/errors/de`)).json()) as { errors: Record<string, string> };
  const german = translations.errors[code ?? ''];
  expect(german).toBeTruthy();

  const notice = page.getByTestId('login-error');
  await expect(notice).toContainText(german ?? '');
  await expect(notice).not.toContainText('LTNS_');
  await expect(notice).not.toContainText(message.replace(/^#LTNS_\d+:\s*/, ''));
});

/** Holds back every script of the app, opens the login page and types the e-mail into the server-rendered field. */
async function typeEmailBeforeHydration(page: Page, email: string): Promise<Locator> {
  await page.route(/^http:\/\/localhost:3001\/.*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto('/auth/login', { waitUntil: 'commit' });
  const field = page.locator(LOGIN_FIELDS.email);
  await field.click();
  await page.keyboard.type(email, { delay: 5 });
  return field;
}

test('the server-rendered login form takes input before hydration', async ({ page }) => {
  const { email } = generateTestUser('early');
  const field = await typeEmailBeforeHydration(page, email);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__ltNgBaseHydrated'] === true), 'typed before hydration').toBe(false);
  expect(await field.inputValue()).toBe(email);
  await waitForHydration(page);
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeEnabled();
});

test('typing before hydration is kept (event replay)', async ({ page, request }) => {
  // Regression (fixed in 22.0.0): the first change detection after hydration wiped early input despite
  // `withEventReplay()`; `provideLtNgBase()` now snapshots and restores it.
  const user = await createUser(request, 'replay');
  const field = await typeEmailBeforeHydration(page, user.email);
  await waitForHydration(page);
  await expect(field).toHaveValue(user.email, { timeout: 3000 });

  // The value reached the form model, not only the DOM: the sign-in request carries it.
  await fillInput(page, LOGIN_FIELDS.password, user.password);
  const signIn = page.waitForRequest((candidate) => isApiPost(candidate, '/iam/sign-in/email'));
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  expect(((await signIn).postDataJSON() as { email: string }).email).toBe(user.email);
  await waitForURLAndHydration(page, /\/app$/);
});
