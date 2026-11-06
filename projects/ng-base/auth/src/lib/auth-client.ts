import type { createAuthClient } from 'better-auth/client';
import { ltSha256, type LtApiUrlResolution, type LtFetch } from '@lenne.tech/ng-base';

import type { LtAuthCallOptions, LtAuthResponse, LtNoStrayCredential, LtPasskey, LtTwoFactorEnableResult, LtUser } from '@lenne.tech/ng-base/auth/provide';

/** Configuration of {@link createLtAuthClient}. */
export interface LtAuthClientConfig {
  /** API origin (`''` for same-origin / proxy). */
  baseURL: string;
  /** Better Auth base path, e.g. `/iam` or `/api/iam` behind the dev proxy. */
  basePath: string;
  /** Register `adminClient()` (default `false`, see `LtAuthOptions.enableAdmin`). */
  enableAdmin?: boolean;
  /** Register `twoFactorClient()` (default `true`). */
  enableTwoFactor?: boolean;
  /** Fetch implementation (the auth-aware `LT_FETCH`). */
  fetch?: LtFetch;
  /** Called when a sign-in answers `twoFactorRedirect` (navigate to the 2FA page). */
  onTwoFactorRedirect?: () => void | Promise<void>;
  /** Additional Better Auth client plugins (e.g. `passkeyClient()` from `@better-auth/passkey/client`). */
  plugins?: unknown[];
}

/**
 * The Better Auth client surface ng-base exposes. Every method that sends a credential hashes it with SHA-256 first
 * (`{ ...params, field: sha256(field) }`, never a whitelist), so a plaintext password never leaves the browser.
 */
export interface LtAuthClient {
  /** The underlying Better Auth client (escape hatch; its methods do NOT hash). */
  readonly raw: ReturnType<typeof createAuthClient>;
  changePassword<T extends { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }>(
    params: LtNoStrayCredential<T, 'currentPassword' | 'newPassword'>,
    options?: LtAuthCallOptions,
  ): Promise<LtAuthResponse>;
  getSession(options?: LtAuthCallOptions): Promise<LtAuthResponse<{ session: Record<string, unknown>; user: LtUser } | null>>;
  passkey: {
    deletePasskey(params: { id: string }, options?: LtAuthCallOptions): Promise<LtAuthResponse>;
    listUserPasskeys(options?: LtAuthCallOptions): Promise<LtAuthResponse<LtPasskey[]>>;
    updatePasskey(params: { id: string; name: string }, options?: LtAuthCallOptions): Promise<LtAuthResponse>;
  };
  requestPasswordReset<T extends { email: string; redirectTo?: string }>(params: LtNoStrayCredential<T, never>, options?: LtAuthCallOptions): Promise<LtAuthResponse>;
  resetPassword<T extends { newPassword: string; token: string }>(params: LtNoStrayCredential<T, 'newPassword'>, options?: LtAuthCallOptions): Promise<LtAuthResponse>;
  sendVerificationEmail<T extends { callbackURL?: string; email: string }>(params: LtNoStrayCredential<T, never>, options?: LtAuthCallOptions): Promise<LtAuthResponse>;
  signIn: {
    email<T extends { callbackURL?: string; email: string; password: string; rememberMe?: boolean }>(
      params: LtNoStrayCredential<T, 'password'>,
      options?: LtAuthCallOptions,
    ): Promise<LtAuthResponse>;
  };
  signOut(options?: LtAuthCallOptions): Promise<LtAuthResponse>;
  signUp: {
    email<T extends { callbackURL?: string; email: string; name: string; password: string }>(
      params: LtNoStrayCredential<T, 'password'>,
      options?: LtAuthCallOptions,
    ): Promise<LtAuthResponse>;
  };
  twoFactor: {
    disable<T extends { password: string }>(params: LtNoStrayCredential<T, 'password'>, options?: LtAuthCallOptions): Promise<LtAuthResponse>;
    enable<T extends { issuer?: string; password: string }>(
      params: LtNoStrayCredential<T, 'password'>,
      options?: LtAuthCallOptions,
    ): Promise<LtAuthResponse<LtTwoFactorEnableResult>>;
    generateBackupCodes<T extends { password: string }>(
      params: LtNoStrayCredential<T, 'password'>,
      options?: LtAuthCallOptions,
    ): Promise<LtAuthResponse<{ backupCodes: string[] }>>;
    verifyBackupCode(params: { code: string; disableSession?: boolean; trustDevice?: boolean }, options?: LtAuthCallOptions): Promise<LtAuthResponse>;
    verifyTotp(params: { code: string; trustDevice?: boolean }, options?: LtAuthCallOptions): Promise<LtAuthResponse>;
  };
  verifyEmail(params: { callbackURL?: string; token: string }, options?: LtAuthCallOptions): Promise<LtAuthResponse>;
}

const pluginRegistry: unknown[] = [];

/** Register extra Better Auth client plugins for every client created afterwards (prefer `provideLtAuth({ plugins })`). */
export function registerLtAuthPlugins(plugins: unknown[]): void {
  pluginRegistry.push(...plugins);
}

/** Plugins registered via {@link registerLtAuthPlugins}. */
export function getLtAuthPluginRegistry(): readonly unknown[] {
  return [...pluginRegistry];
}

/** Clear the plugin registry (tests). */
export function clearLtAuthPluginRegistry(): void {
  pluginRegistry.length = 0;
}

/**
 * `baseURL` / `basePath` of the Better Auth client for an API URL resolution: behind the dev proxy the origin is the
 * app itself (`''`) and the path gets the `/api` prefix (`/iam` → `/api/iam`), otherwise the API base URL with the
 * configured path.
 */
export function resolveLtAuthClientBase(resolution: Pick<LtApiUrlResolution, 'baseUrl' | 'proxy'>, basePath: string): { basePath: string; baseURL: string } {
  const trimmed = (basePath || '/iam').replace(/\/+$/, '');
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (resolution.proxy) {
    return { basePath: path === '/api' || path.startsWith('/api/') ? path : `/api${path}`, baseURL: '' };
  }
  return { basePath: path, baseURL: resolution.baseUrl };
}

/**
 * Absolute Better Auth URL for `baseURL` + `basePath`.
 *
 * Better Auth rejects a relative `baseURL` ("Invalid base URL"), so an empty origin (same-origin deployment, dev proxy
 * `/api/iam`) is resolved against the browser origin. Without a usable origin (server without API URL) the path is
 * returned unchanged; such a client cannot reach the backend anyway.
 */
export function resolveLtAuthClientUrl(baseURL: string, basePath: string): string {
  const path = basePath ? (basePath.startsWith('/') ? basePath : `/${basePath}`) : '';
  if (baseURL) {
    return `${baseURL.replace(/\/+$/, '')}${path}`;
  }
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return origin && origin !== 'null' ? `${origin}${path}` : path;
}

/**
 * Load `better-auth/client` and its plugins on demand. Dynamic imports keep Better Auth (and better-fetch) out of the
 * initial bundle: esbuild puts them into a lazy chunk that is fetched with the first auth action.
 */
function loadBetterAuth(): Promise<[typeof import('better-auth/client'), typeof import('better-auth/client/plugins')]> {
  return Promise.all([import('better-auth/client'), import('better-auth/client/plugins')]);
}

/**
 * Create the hashing Better Auth client wrapper.
 *
 * Uses the framework-agnostic `better-auth/client` (`createAuthClient`) with `twoFactorClient()` (and `adminClient()` when
 * enabled), the plugins of `config.plugins` and the registry, and the given fetch. Async because Better Auth is loaded
 * on first use (see `LtAuthService.getClient()`, which shares one client per app).
 */
export async function createLtAuthClient(config: LtAuthClientConfig): Promise<LtAuthClient> {
  const [{ createAuthClient }, { adminClient, twoFactorClient }] = await loadBetterAuth();
  const plugins: unknown[] = [];
  if (config.enableTwoFactor !== false) {
    plugins.push(twoFactorClient({ onTwoFactorRedirect: () => config.onTwoFactorRedirect?.() }));
  }
  if (config.enableAdmin) {
    plugins.push(adminClient());
  }
  plugins.push(...(config.plugins ?? []), ...pluginRegistry);
  const fetchImpl = config.fetch;
  const raw = createAuthClient({
    baseURL: resolveLtAuthClientUrl(config.baseURL, config.basePath),
    fetchOptions: {
      credentials: 'include',
      ...(fetchImpl ? { customFetchImpl: (input: RequestInfo | URL, init?: RequestInit) => fetchImpl(input, init) } : {}),
    },
    plugins: plugins as never[],
  });
  // Better Auth's client is a Proxy without own keys: every member is listed explicitly, never spread.
  const client = raw as unknown as Record<string, any>;
  const call = (path: string[], args: unknown[]): Promise<LtAuthResponse<any>> => {
    let target: any = client;
    for (const key of path) {
      target = target[key];
    }
    return target(...args);
  };
  const hashed = async <T extends Record<string, unknown>>(params: T, fields: string[], method: string): Promise<T> => {
    const result: Record<string, unknown> = { ...params };
    for (const field of fields) {
      const value = params[field];
      if (typeof value !== 'string' || !value) {
        throw new Error(`[@lenne.tech/ng-base] ${method}: "${field}" is required`);
      }
      result[field] = await ltSha256(value);
    }
    return result as T;
  };
  const withOptions = (options?: LtAuthCallOptions) => (options ? [{ fetchOptions: options }] : []);

  return {
    raw,
    changePassword: async (params, options) =>
      call(['changePassword'], [await hashed(params as Record<string, unknown>, ['currentPassword', 'newPassword'], 'changePassword'), ...withOptions(options)]),
    getSession: (options) => call(['getSession'], options ? [{ fetchOptions: options }] : []),
    passkey: {
      deletePasskey: (params, options) => call(['$fetch'], ['/passkey/delete-passkey', { body: params, method: 'POST', ...options }]),
      listUserPasskeys: (options) => call(['$fetch'], ['/passkey/list-user-passkeys', { method: 'GET', ...options }]),
      updatePasskey: (params, options) => call(['$fetch'], ['/passkey/update-passkey', { body: params, method: 'POST', ...options }]),
    },
    requestPasswordReset: (params, options) => call(['requestPasswordReset'], [params, ...withOptions(options)]),
    resetPassword: async (params, options) => call(['resetPassword'], [await hashed(params as Record<string, unknown>, ['newPassword'], 'resetPassword'), ...withOptions(options)]),
    sendVerificationEmail: (params, options) => call(['sendVerificationEmail'], [params, ...withOptions(options)]),
    signIn: {
      email: async (params, options) => call(['signIn', 'email'], [await hashed(params as Record<string, unknown>, ['password'], 'signIn.email'), ...withOptions(options)]),
    },
    signOut: (options) => call(['signOut'], options ? [{ fetchOptions: options }] : []),
    signUp: {
      email: async (params, options) => call(['signUp', 'email'], [await hashed(params as Record<string, unknown>, ['password'], 'signUp.email'), ...withOptions(options)]),
    },
    twoFactor: {
      disable: async (params, options) =>
        call(['twoFactor', 'disable'], [await hashed(params as Record<string, unknown>, ['password'], 'twoFactor.disable'), ...withOptions(options)]),
      enable: async (params, options) =>
        call(['twoFactor', 'enable'], [await hashed(params as Record<string, unknown>, ['password'], 'twoFactor.enable'), ...withOptions(options)]),
      generateBackupCodes: async (params, options) =>
        call(['twoFactor', 'generateBackupCodes'], [await hashed(params as Record<string, unknown>, ['password'], 'twoFactor.generateBackupCodes'), ...withOptions(options)]),
      verifyBackupCode: (params, options) => call(['twoFactor', 'verifyBackupCode'], [params, ...withOptions(options)]),
      verifyTotp: (params, options) => call(['twoFactor', 'verifyTotp'], [params, ...withOptions(options)]),
    },
    verifyEmail: (params, options) => call(['verifyEmail'], [{ query: params }, ...withOptions(options)]),
  };
}
