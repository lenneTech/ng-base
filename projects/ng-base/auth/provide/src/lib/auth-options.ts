import { inject, InjectionToken } from '@angular/core';
import { LT_RUNTIME_CONFIG, mergeLtFeatureOptions } from '@lenne.tech/ng-base';

/** Cookie names (exact names win over the `NG_PUBLIC_COOKIE_PREFIX` derived ones). */
export interface LtAuthCookieNamesOptions {
  /** Auth-state cookie (default `lt-auth-state`, or `<prefix>-auth-state`). */
  state?: string;
  /** JWT cookie (default `lt-jwt-token`, or `<prefix>-jwt-token`). */
  token?: string;
}

/** Options of `provideLtAuth()`; runtime overrides via `NG_PUBLIC_LT_AUTH_*`. */
export interface LtAuthOptions {
  /** Better Auth base path, must equal nest-server `betterAuth.basePath` (default `/iam`). */
  basePath?: string;
  /** Cookie names. */
  cookieNames?: LtAuthCookieNamesOptions;
  /**
   * Register Better Auth's `adminClient()` plugin (default **`false`**). nest-server does not serve the admin plugin
   * today (routes 404), and its methods are not hashed. Enable only together with a backend that registers `admin()`.
   */
  enableAdmin?: boolean;
  /**
   * Offer passkeys (default `true`); `false` makes `passkeySupported()` false. The passkey flows call
   * `/iam/passkey/*` directly, so `@better-auth/passkey` is not needed (add `passkeyClient()` via `plugins` if wanted).
   */
  enablePasskey?: boolean;
  /** Register the two-factor plugin (default `true`). */
  enableTwoFactor?: boolean;
  /** 401 handling. */
  interceptor?: {
    /** Detect session loss on 401 and redirect to the login page (default `true`). */
    enabled?: boolean;
    /** Extra route prefixes on which a 401 never logs out (merged with the built-in auth pages). */
    publicPaths?: string[];
  };
  /** Login page (default `/auth/login`). */
  loginPath?: string;
  /** Extra Better Auth client plugins (same as `registerLtAuthPlugins()`). */
  plugins?: unknown[];
  /** First-admin setup flow. */
  systemSetup?: {
    /** Enable the setup redirect of `ltSystemSetupGuard` (default `false`). */
    enabled?: boolean;
    /** Setup page (default `/auth/setup`). */
    setupPath?: string;
  };
  /** Where a sign-in that needs a second factor redirects (default `/auth/2fa`). */
  twoFactorRedirectPath?: string;
}

/** Fully resolved auth options. */
export interface LtResolvedAuthOptions {
  basePath: string;
  cookieNames: Required<LtAuthCookieNamesOptions>;
  enableAdmin: boolean;
  enablePasskey: boolean;
  enableTwoFactor: boolean;
  interceptor: { enabled: boolean; publicPaths: string[] };
  loginPath: string;
  plugins: unknown[];
  systemSetup: { enabled: boolean; setupPath: string };
  twoFactorRedirectPath: string;
}

/** Default name of the auth-state cookie. */
export const LT_AUTH_STATE_COOKIE_DEFAULT = 'lt-auth-state';
/** Default name of the JWT cookie. */
export const LT_JWT_TOKEN_COOKIE_DEFAULT = 'lt-jwt-token';

/** Defaults of {@link LtAuthOptions}. */
export const LT_AUTH_DEFAULTS: LtResolvedAuthOptions = {
  basePath: '/iam',
  cookieNames: { state: LT_AUTH_STATE_COOKIE_DEFAULT, token: LT_JWT_TOKEN_COOKIE_DEFAULT },
  enableAdmin: false,
  enablePasskey: true,
  enableTwoFactor: true,
  interceptor: { enabled: true, publicPaths: [] },
  loginPath: '/auth/login',
  plugins: [],
  systemSetup: { enabled: false, setupPath: '/auth/setup' },
  twoFactorRedirectPath: '/auth/2fa',
};

/** Options passed to `provideLtAuth()` (raw). */
export const LT_AUTH_INPUT_OPTIONS = new InjectionToken<LtAuthOptions>('LT_AUTH_INPUT_OPTIONS', { factory: () => ({}) });

/**
 * Resolved auth options: defaults ← `provideLtAuth(options)` ← runtime `NG_PUBLIC_LT_AUTH_*`; cookie names derived
 * from `NG_PUBLIC_COOKIE_PREFIX` unless set explicitly.
 */
export const LT_AUTH_OPTIONS = new InjectionToken<LtResolvedAuthOptions>('LT_AUTH_OPTIONS', {
  factory: () => {
    const runtime = inject(LT_RUNTIME_CONFIG, { optional: true });
    const merged = mergeLtFeatureOptions(LT_AUTH_DEFAULTS, inject(LT_AUTH_INPUT_OPTIONS), runtime?.lt.auth);
    return { ...merged, cookieNames: resolveLtAuthCookieNames(merged.cookieNames, runtime?.cookiePrefix) };
  },
});

/** Sanitise a cookie prefix to RFC 6265 token characters (`[A-Za-z0-9._-]`). */
export function resolveLtCookiePrefix(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/[^A-Za-z0-9._-]/g, '') : '';
}

/**
 * Cookie names: an explicit non-default name wins, else `<prefix>-auth-state` / `<prefix>-jwt-token`, else the defaults.
 * Mirror the prefix on the backend (`COOKIE_PREFIX`) so both sides agree.
 */
export function resolveLtAuthCookieNames(configured: LtAuthCookieNamesOptions | undefined, cookiePrefix?: unknown): Required<LtAuthCookieNamesOptions> {
  const prefix = resolveLtCookiePrefix(cookiePrefix);
  const state = configured?.state && configured.state !== LT_AUTH_STATE_COOKIE_DEFAULT ? configured.state : prefix ? `${prefix}-auth-state` : LT_AUTH_STATE_COOKIE_DEFAULT;
  const token = configured?.token && configured.token !== LT_JWT_TOKEN_COOKIE_DEFAULT ? configured.token : prefix ? `${prefix}-jwt-token` : LT_JWT_TOKEN_COOKIE_DEFAULT;
  return { state, token };
}
