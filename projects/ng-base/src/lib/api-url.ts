import { isPlatformServer } from '@angular/common';
import { inject, isDevMode, PLATFORM_ID, Service } from '@angular/core';

import { warnLtOnce } from './warn-once';
import { LT_RUNTIME_CONFIG, LT_SERVER_RUNTIME_CONFIG } from './runtime-config';

/** Render scope an API URL is resolved for. */
export type LtRenderScope = 'browser' | 'server';

/** Outcome of resolving the API base URL for the current render scope. */
export interface LtApiUrlResolution {
  /** Base URL to prefix onto API paths: `'/api'` in proxy mode, `''` when unresolved. No trailing slash. */
  baseUrl: string;
  /** `true` when no API URL is configured for {@link scope}. */
  missing: boolean;
  /** `true` when the dev-server proxy prefix `/api` is in use. */
  proxy: boolean;
  /** Scope the resolution was performed for. */
  scope: LtRenderScope;
}

/** Inputs of {@link resolveLtApiBaseUrl}. */
export interface LtApiUrlInputs {
  /** `NG_PUBLIC_API_PROXY` (`null` = unset). */
  apiProxy: boolean | null;
  /** `NG_PUBLIC_API_URL`. */
  apiUrl: string;
  /** Whether the app runs in dev mode (`isDevMode()`), used when `apiProxy` is unset. */
  devMode: boolean;
  /** Render scope. */
  scope: LtRenderScope;
  /** `NG_API_URL` (server only). */
  serverApiUrl?: string;
}

const MISSING_API_URL_WARNING: Record<LtRenderScope, string> = {
  browser:
    '[@lenne.tech/ng-base] No API URL configured. Set NG_PUBLIC_API_URL. API paths stay relative and resolve against the app ' +
    'origin, so auth and setup calls 404 unless the app is served behind a same-origin reverse proxy.',
  server:
    '[@lenne.tech/ng-base] No API URL configured for SSR. Set NG_API_URL or NG_PUBLIC_API_URL. API paths stay relative, so ' + 'server-side requests never reach the backend.',
};

/**
 * Pure resolution of the API base URL (no DI, no logging).
 *
 * - Server: `NG_API_URL` → `NG_PUBLIC_API_URL` → `''`. The proxy is never used during SSR.
 * - Browser: `/api` when the proxy is on (explicitly, or implicitly in dev mode while unset), else `NG_PUBLIC_API_URL` → `''`.
 *
 * Trailing slashes are stripped so `${baseUrl}${path}` never produces a double slash.
 */
export function resolveLtApiBaseUrl(inputs: LtApiUrlInputs): LtApiUrlResolution {
  if (inputs.scope === 'server') {
    const apiUrl = inputs.serverApiUrl || inputs.apiUrl || '';
    return { baseUrl: stripTrailingSlashes(apiUrl), missing: !apiUrl, proxy: false, scope: 'server' };
  }
  if (inputs.apiProxy === true || (inputs.apiProxy === null && inputs.devMode)) {
    return { baseUrl: '/api', missing: false, proxy: true, scope: 'browser' };
  }
  const apiUrl = inputs.apiUrl || '';
  return { baseUrl: stripTrailingSlashes(apiUrl), missing: !apiUrl, proxy: false, scope: 'browser' };
}

/** Whether `url` is absolute (`scheme:` or protocol-relative `//`). */
export function isLtAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(url) || url.startsWith('//');
}

/**
 * The single URL builder used by auth, system setup, error translation, files, AI and sync.
 *
 * Reads {@link LT_RUNTIME_CONFIG} and, on the server, {@link LT_SERVER_RUNTIME_CONFIG}. A missing API URL is warned
 * about once per scope; an implicit dev proxy (unset `NG_PUBLIC_API_PROXY` in dev mode) once as well.
 */
@Service()
export class LtApiUrlService {
  private readonly runtimeConfig = inject(LT_RUNTIME_CONFIG, { optional: true });
  private readonly serverConfig = inject(LT_SERVER_RUNTIME_CONFIG, { optional: true });
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));

  /** Resolve the base URL for the current scope without logging. */
  resolve(): LtApiUrlResolution {
    return resolveLtApiBaseUrl({
      apiProxy: this.runtimeConfig?.apiProxy ?? null,
      apiUrl: this.runtimeConfig?.apiUrl ?? '',
      devMode: isDevMode(),
      scope: this.isServer ? 'server' : 'browser',
      serverApiUrl: this.serverConfig?.serverApiUrl,
    });
  }

  /** Base URL (no trailing slash) for the current scope. */
  baseUrl(): string {
    return this.resolveAndWarn().baseUrl;
  }

  /** Build a full API URL for a path such as `/iam/sign-in/email`. Absolute URLs are returned unchanged. */
  buildUrl(path: string): string {
    if (isLtAbsoluteUrl(path)) {
      return path;
    }
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${this.resolveAndWarn().baseUrl}${normalized}`;
  }

  /**
   * Build the URL the browser uses for `path`, also during SSR: `NG_PUBLIC_API_URL` (or `/api` behind the dev proxy),
   * never the server-only `NG_API_URL`. For links that end up in the HTML (`href`, `src`), which the browser follows
   * itself: an internal API host would be unreachable there and must not leak into the page. Absolute URLs are returned
   * unchanged.
   */
  buildBrowserUrl(path: string): string {
    if (isLtAbsoluteUrl(path)) {
      return path;
    }
    const resolution = resolveLtApiBaseUrl({
      apiProxy: this.runtimeConfig?.apiProxy ?? null,
      apiUrl: this.runtimeConfig?.apiUrl ?? '',
      devMode: isDevMode(),
      scope: 'browser',
    });
    return `${resolution.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /** Whether browser requests go through the dev-server proxy under `/api`. Always `false` on the server. */
  isProxy(): boolean {
    return this.resolve().proxy;
  }

  /** Report a missing API URL (`dev`: warning, production: error), at most once per scope. Used by the config check. */
  reportMissing(): boolean {
    const resolution = this.resolve();
    if (resolution.missing) {
      warnLtOnce(`missing-api-url:${resolution.scope}`, MISSING_API_URL_WARNING[resolution.scope], isDevMode() ? 'warn' : 'error');
    }
    return resolution.missing;
  }

  private resolveAndWarn(): LtApiUrlResolution {
    const resolution = this.resolve();
    if (resolution.missing) {
      warnLtOnce(`missing-api-url:${resolution.scope}`, MISSING_API_URL_WARNING[resolution.scope]);
    }
    if (resolution.proxy && this.runtimeConfig?.apiProxy === null) {
      warnLtOnce(
        'api-proxy-implicit',
        '[@lenne.tech/ng-base] API proxy (/api) activated implicitly because the app runs in dev mode. ' +
          'Set NG_PUBLIC_API_PROXY=true to make it explicit, or NG_PUBLIC_API_PROXY=false to call the API directly.',
      );
    }
    return resolution;
  }
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}
