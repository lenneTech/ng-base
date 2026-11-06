/** Built-in route prefixes on which a 401 never logs out (auth pages). Extend via `provideLtAuth({ interceptor: { publicPaths } })`. */
export const LT_AUTH_PUBLIC_PATHS: readonly string[] = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/2fa',
  '/auth/setup',
  '/auth/verify-email',
];

/** API path fragments whose 401 is part of a normal auth flow (never treated as session loss). */
export const LT_AUTH_ENDPOINT_FRAGMENTS: readonly string[] = [
  '/sign-in',
  '/sign-up',
  '/sign-out',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/get-session',
  '/list-sessions',
  '/revoke-session',
  '/revoke-other-sessions',
  '/token',
  '/passkey/',
  '/list-user-passkeys',
  '/generate-register-options',
  '/verify-registration',
  '/generate-authenticate-options',
  '/verify-authentication',
  '/two-factor/',
];

/**
 * Paths that need the session cookie even in JWT mode: passkey and 2FA challenges are bound to cookies, and
 * `/get-session` resolves the session from the cookie only (a bearer-only request gets `200 null`, which the session
 * probe would read as "dead" for every user in JWT mode).
 */
export const LT_AUTH_COOKIE_PATHS: readonly string[] = ['/passkey/', '/two-factor/', '/2fa/', '/get-session'];

/** Whether a 401 from `url` belongs to an auth flow (wrong password, wrong code, probe) rather than a lost session. */
export function isLtAuthEndpoint(url: string): boolean {
  return LT_AUTH_ENDPOINT_FRAGMENTS.some((fragment) => url.includes(fragment));
}

/** Whether `url` needs the session cookie even in JWT mode (see {@link LT_AUTH_COOKIE_PATHS}). */
export function ltUrlRequiresCookies(url: string): boolean {
  return LT_AUTH_COOKIE_PATHS.some((path) => url.includes(path));
}

/** URL string of a fetch input. */
export function ltRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

/** Path of a URL or route (`/a/b?x=1#y` → `/a/b`). */
export function ltPathOf(url: string): string {
  return url.split(/[?#]/)[0] || '/';
}

/**
 * Whether `url` goes to the API, so it may carry credentials and the Bearer token:
 *
 * - it starts with the API base URL at a path boundary (`https://api.example.com` matches `https://api.example.com/x`,
 *   never `https://api.example.com.evil.test`);
 * - or it is same-origin and starts with `/api` (dev proxy);
 * - or no API URL is configured and it is same-origin (same-origin reverse proxy).
 *
 * Absolute URLs on `origin` are compared by their path. Foreign hosts never get the token.
 */
export function isLtApiRequest(url: string, baseUrl: string, origin?: string | null): boolean {
  if (baseUrl && hasPrefix(url, baseUrl)) {
    return true;
  }
  let path = url;
  if (origin && origin !== 'null' && hasPrefix(url, origin)) {
    path = url.slice(origin.length) || '/';
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    return false;
  }
  if (hasPrefix(path, '/api')) {
    return true;
  }
  if (!baseUrl) {
    return true;
  }
  return baseUrl.startsWith('/') && hasPrefix(path, baseUrl);
}

function hasPrefix(value: string, prefix: string): boolean {
  if (!value.startsWith(prefix)) {
    return false;
  }
  const next = value.charAt(prefix.length);
  return next === '' || next === '/' || next === '?' || next === '#' || prefix.endsWith('/');
}
